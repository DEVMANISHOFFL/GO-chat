export const getDraft = (roomId: string) => {
    if (typeof window === 'undefined') return '';
    try {
        return localStorage.getItem(`draft:${roomId}`) || '';
    } catch {
        return '';
    }
};


export const setDraft = (roomId: string, value: string) => {
    if (typeof window === 'undefined') return;
    try {
        if (value) localStorage.setItem(`draft:${roomId}`, value);
        else localStorage.removeItem(`draft:${roomId}`);
    } catch { }
};