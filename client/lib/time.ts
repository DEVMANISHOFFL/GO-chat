import { format, isSameDay as _isSameDay } from 'date-fns';


export const fmtTime = (iso: string) => format(new Date(iso), 'HH:mm');
export const fmtDay = (iso: string) => format(new Date(iso), 'EEE, MMM d');
export const isSameDay = (aIso: string, bIso: string) => _isSameDay(new Date(aIso), new Date(bIso));