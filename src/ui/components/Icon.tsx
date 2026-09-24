import { useEffect, useRef } from 'react';
import { setIcon } from 'obsidian';

/** A Lucide icon via Obsidian's `setIcon`. */
export function Icon({ name, className }: { name: string; className?: string }) {
	const ref = useRef<HTMLSpanElement>(null);
	useEffect(() => {
		if (ref.current) setIcon(ref.current, name);
	}, [name]);
	return <span ref={ref} className={`abc-icon ${className ?? ''}`} aria-hidden="true" />;
}
