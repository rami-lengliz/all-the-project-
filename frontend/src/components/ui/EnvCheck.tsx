/**
 * EnvCheck — runtime warning banner shown when NEXT_PUBLIC_API_URL is not set.
 *
 * Renders nothing in production when everything is configured correctly.
 * In development or misconfigured deployments it shows a sticky red banner
 * so the problem is immediately visible.
 */
'use client';

import { isApiUrlConfigured } from '@/lib/api/env';

export function EnvCheck() {
    // Only render on the client (window check) + only when the var is missing
    if (typeof window === 'undefined') return null;
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
