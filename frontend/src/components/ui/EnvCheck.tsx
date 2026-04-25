/**
 * EnvCheck — runtime warning banner shown when NEXT_PUBLIC_API_URL is not set.
 *
 * Renders nothing in production when everything is configured correctly.
 * In development or misconfigured deployments it shows a sticky red banner
 * so the problem is immediately visible.
 */
'use client';

import { useEffect, useState } from 'react';
import { isApiUrlConfigured } from '@/lib/api/env';

export function EnvCheck() {
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    // Keep the initial server and client render identical to avoid hydration mismatches.
    // The warning still appears immediately after mount when the env is missing.
    if (!isMounted) return null;
    if (isApiUrlConfigured()) return null;

    return (
        <div
            id="env-check-warning"
            role="alert"
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                zIndex: 9999,
                background: '#dc2626',
                color: '#fff',
                padding: '10px 16px',
                fontSize: '13px',
                fontFamily: 'monospace',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
            }}
        >
            <span>⚠️</span>
            <strong>NEXT_PUBLIC_API_URL is not set.</strong>
            <span>
                API calls will fail. Add it to{' '}
                <code
                    style={{ background: 'rgba(0,0,0,0.3)', padding: '1px 5px', borderRadius: 3 }}
                >
                    .env.local
                </code>{' '}
                and restart the dev server.
                <em style={{ marginLeft: 8, opacity: 0.8 }}>
                    Example: NEXT_PUBLIC_API_URL=http://localhost:3000
                </em>
            </span>
        </div>
    );
}
