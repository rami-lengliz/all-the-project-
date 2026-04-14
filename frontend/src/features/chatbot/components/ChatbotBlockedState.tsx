import React from 'react';

export function ChatbotBlockedState({
  status,
  reason,
}: {
  status: string;
  reason?: string;
}) {
  let title = 'Action Blocked';
  let description = reason || 'Your request could not be completed at this time.';
  let icon = 'fa-shield-halved';
  let colorClass = 'text-red-500 bg-red-50 border-red-200';

  if (status === 'RATE_LIMITED' || status === 'rate_limited') {
    title = 'Rate Limit Exceeded';
    description = reason || 'You are sending too many requests. Please slow down and try again in a few moments.';
    icon = 'fa-stopwatch';
    colorClass = 'text-orange-500 bg-orange-50 border-orange-200';
  } else if (status === 'COOLDOWN_ACTIVE' || status === 'cooldown_active') {
    title = 'Temporarily Resting';
    description = reason || 'A cooldown is active. Please try your action later.';
    icon = 'fa-hourglass-half';
    colorClass = 'text-orange-500 bg-orange-50 border-orange-200';
  } else if (status === 'RESTRICTED' || status === 'trust_restricted' || status === 'suspicious_activity') {
    title = 'Action Restricted';
    description = reason || 'This action requires additional verification or is restricted for your account.';
    icon = 'fa-lock';
    colorClass = 'text-red-600 bg-red-50 border-red-200';
  } else if (status === 'policy_blocked') {
    title = 'Permission Denied';
    description = reason || 'You do not have permission to execute this action.';
    icon = 'fa-ban';
    colorClass = 'text-gray-600 bg-gray-50 border-gray-200';
  }

  return (
    <div className={`p-4 rounded-xl border ${colorClass} max-w-sm my-2 flex items-start gap-3`}>
      <div className="mt-0.5">
        <i className={`fa-solid ${icon} text-lg`} />
      </div>
      <div>
        <h4 className="font-semibold text-sm mb-1">{title}</h4>
        <p className="text-xs opacity-90 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}
