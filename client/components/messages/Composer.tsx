'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Paperclip, Smile, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getDraft, setDraft } from '@/lib/drafts';


function useAutosizeTextArea(textareaRef: HTMLTextAreaElement | null, value: string) {
    useEffect(() => {
        if (!textareaRef) return;
        textareaRef.style.height = '0px';
        const scrollH = textareaRef.scrollHeight;
        const max = 200; // px cap
        textareaRef.style.height = Math.min(scrollH, max) + 'px';
    }, [textareaRef, value]);
}

export type ComposerProps = {
    roomId: string;
    placeholder?: string;
    disabled?: boolean;
    sending?: boolean;
    onSend: (payload: { text: string; attachments?: File[] }) => void;
    onTypingStart?: () => void;
    onTypingStop?: () => void;
};


export default function Composer({ roomId, placeholder, disabled, sending, onSend, onTypingStart, onTypingStop }: ComposerProps) {
    const [value, setValue] = useState<string>(() => getDraft(roomId));
    const [files, setFiles] = useState<File[]>([]);
    const taRef = useRef<HTMLTextAreaElement | null>(null);
    const typingTimer = useRef<number | null>(null);


    useAutosizeTextArea(taRef.current, value);

    useEffect(() => setDraft(roomId, value), [roomId, value]);


    // reset on room change (load existing)
    useEffect(() => {
        setValue(getDraft(roomId));
        setFiles([]);
    }, [roomId]);


    const triggerTyping = useCallback(() => {
        onTypingStart?.();
        if (typingTimer.current) window.clearTimeout(typingTimer.current);
        typingTimer.current = window.setTimeout(() => onTypingStop?.(), 1200);
    }, [onTypingStart, onTypingStop]);


    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();

            const trimmed = value.trim();
            if (trimmed && !disabled) {
                onSend({text:trimmed});       // <- call your send callback
                setValue('');          // clear textarea
            }
        }
        // if Shift+Enter → allow newline (do nothing, browser inserts '\n')
    };

    const doSend = () => {
        const text = value.trim();
        if (!text && files.length === 0) return;
        onSend({ text, attachments: files.length ? files : undefined });
        setValue('');
        setFiles([]);
        setDraft(roomId, '');
    };


    const onFilePick: React.ChangeEventHandler<HTMLInputElement> = (e) => {
        const list = e.target.files;
        if (!list || !list.length) return;
        setFiles((prev) => [...prev, ...Array.from(list)]);
        e.currentTarget.value = '';
    };

    return (
        <div className="border-t bg-background p-3">
            {/* attachments preview (simple chips) */}
            {!!files.length && (
                <div className="mx-auto mb-2 flex max-w-3xl flex-wrap gap-2">
                    {files.map((f, i) => (
                        <div key={i} className="flex items-center gap-2 rounded-full border bg-card px-2 py-1 text-xs">
                            <span className="max-w-[180px] truncate">{f.name}</span>
                            <button className="text-muted-foreground hover:text-foreground" onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}>
                                ×
                            </button>
                        </div>
                    ))}
                </div>
            )}


            <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-xl border bg-card p-2">
                <label className="cursor-pointer p-2" aria-label="Attach files">
                    <input type="file" multiple className="hidden" onChange={onFilePick} />
                    <Paperclip className="h-5 w-5" />
                </label>
                <textarea
                    ref={taRef}
                    value={value}
                    disabled={disabled}
                    onKeyDown={handleKeyDown}
                    onChange={(e) => {
                        setValue(e.target.value);
                        triggerTyping();
                    }}
                    placeholder={placeholder || 'Message'}
                    rows={1}
                    className="max-h-[200px] min-h-[44px] flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground"
                />


                <Button size="sm" onClick={doSend} disabled={sending || (!value.trim() && files.length === 0)} aria-label="Send">
                    <Send className="mr-2 h-4 w-4" /> Send
                </Button>
                <Button size="icon" variant="ghost" aria-label="Emoji picker (todo)">
                    <Smile className="h-5 w-5" />
                </Button>
            </div>
        </div>
    );
}