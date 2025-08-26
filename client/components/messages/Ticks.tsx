'use client';
import React from 'react';

export type MessageStatus = 'sent' | 'delivered' | 'read' | undefined;

export default function Ticks({ status }: { status: MessageStatus }) {
  if (status === 'read')      return <span className="ml-1 text-primary">✓✓</span>;         // colored
  if (status === 'delivered') return <span className="ml-1 text-muted-foreground">✓✓</span>; // double
  if (status === 'sent')      return <span className="ml-1 text-muted-foreground">✓</span>;  // single
  return null;
}
