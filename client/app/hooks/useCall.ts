// hooks/useCall.ts
'use client';
import { useEffect, useRef, useState } from 'react';

type SendFn = (msg: any) => void;

const RTC_CFG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

export function useCall(opts: {
  wsSend: SendFn;
  myUserId: string;
  peerUserId: string;
  roomId: string;
  onSignal: (handler: (ev: any) => void) => void;
}) {
  const { wsSend, peerUserId, roomId, onSignal } = opts;

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const remoteRef = useRef<MediaStream | null>(null);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [inCall, setInCall] = useState(false);
  const [ringing, setRinging] = useState(false);

  const ensurePC = () => {
    if (pcRef.current) return pcRef.current;
    const pc = new RTCPeerConnection(RTC_CFG);

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        wsSend({
          type: 'rtc.ice',
          to: peerUserId,
          payload: { candidate: e.candidate, roomId },
        });
      }
    };

    const rstream = new MediaStream();
    remoteRef.current = rstream;
    setRemoteStream(rstream);

    pc.ontrack = (e) => {
      e.streams[0].getTracks().forEach((t) => {
        if (!rstream.getTracks().find((rt) => rt.id === t.id)) {
          rstream.addTrack(t);
        }
      });
      setRemoteStream(new MediaStream(rstream.getTracks()));
    };

    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === 'disconnected' || st === 'failed' || st === 'closed') {
        endCall();
      }
    };

    pcRef.current = pc;
    return pc;
  };

  const getMedia = async () => {
    if (localRef.current) return localRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localRef.current = stream;
    setLocalStream(stream);
    return stream;
  };

  async function startCall() {
    const pc = ensurePC();
    const stream = await getMedia();
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    wsSend({ type: 'rtc.offer', to: peerUserId, payload: { sdp: offer.sdp, roomId } });
    setInCall(true);
  }

  async function acceptCall(sdp: string) {
    const pc = ensurePC();
    const stream = await getMedia();
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));

    await pc.setRemoteDescription({ type: 'offer', sdp });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    wsSend({ type: 'rtc.answer', to: peerUserId, payload: { sdp: answer.sdp, roomId } });
    setRinging(false);
    setInCall(true);
  }

  async function handleAnswer(sdp: string) {
    const pc = ensurePC();
    await pc.setRemoteDescription({ type: 'answer', sdp });
  }

  async function addIce(candidate: RTCIceCandidateInit) {
    const pc = ensurePC();
    try {
      await pc.addIceCandidate(candidate);
    } catch {}
  }

  function endCall() {
    setRinging(false);
    setInCall(false);

    try {
      wsSend({ type: 'rtc.end', to: peerUserId, payload: { roomId } });
    } catch {}

    if (pcRef.current) {
      pcRef.current.close();
    }
    pcRef.current = null;

    localRef.current?.getTracks().forEach((t) => t.stop());
    localRef.current = null;
    setLocalStream(null);

    remoteRef.current = null;
    setRemoteStream(null);
  }

  useEffect(() => {
    return onSignal((ev: any) => {
      if (!ev || !ev.type) return;
      if (ev.type === 'rtc.offer' && ev.payload?.roomId === roomId && ev.from === peerUserId) {
        setRinging(true);
        (window as any).__incomingSDP = ev.payload.sdp;
      }
      if (ev.type === 'rtc.answer' && ev.payload?.roomId === roomId && ev.from === peerUserId) {
        handleAnswer(ev.payload.sdp);
      }
      if (ev.type === 'rtc.ice' && ev.payload?.roomId === roomId && ev.from === peerUserId) {
        addIce(ev.payload.candidate);
      }
      if (ev.type === 'rtc.end' && ev.payload?.roomId === roomId && ev.from === peerUserId) {
        endCall();
      }
    });
  }, [onSignal, roomId, peerUserId]);

  return {
    localStream,
    remoteStream,
    inCall,
    ringing,
    startCall,
    acceptCallWithStoredOffer: () => acceptCall((window as any).__incomingSDP),
    endCall,
  };
}
