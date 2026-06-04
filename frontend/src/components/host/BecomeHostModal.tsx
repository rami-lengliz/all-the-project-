import { useState } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  isPending: boolean;
  errorMessage: string | null;
  // Verification status — modal blocks if neither is verified
  emailVerified: boolean;
  phoneVerified: boolean;
  onRequestVerify: () => void;
}

export function BecomeHostModal({
  open,
  onClose,
  onConfirm,
  isPending,
  errorMessage,
  emailVerified,
  phoneVerified,
  onRequestVerify,
}: Props) {
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const verified = emailVerified || phoneVerified;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Become a host</h3>
            <p className="text-sm text-gray-600 mt-0.5">
              Two quick checks before you can list.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            <i className="fa-solid fa-times text-lg" />
          </button>
        </div>

        {/* Step 1 — Verification status */}
        <div className="rounded-xl border border-gray-200 p-4 mb-3">
          <div className="flex items-start gap-3">
            <span
              className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                verified ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-700'
              }`}
            >
              <i className={`fa-solid ${verified ? 'fa-check' : 'fa-1'} text-xs`} />
            </span>
            <div className="flex-1">
              <div className="text-sm font-semibold text-gray-900">
                Verify your contact
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                Renters need to be able to reach you.
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${
                    emailVerified
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  <i className={`fa-solid ${emailVerified ? 'fa-check' : 'fa-envelope'} text-[10px]`} />
                  Email {emailVerified ? 'verified' : 'not verified'}
                </span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${
                    phoneVerified
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  <i className={`fa-solid ${phoneVerified ? 'fa-check' : 'fa-mobile-screen'} text-[10px]`} />
                  Phone {phoneVerified ? 'verified' : 'not verified'}
                </span>
              </div>
              {!verified && (
                <button
                  type="button"
                  onClick={onRequestVerify}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600"
                >
                  <i className="fa-solid fa-paper-plane text-[10px]" />
                  Verify now
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Step 2 — Host terms */}
        <div
          className={`rounded-xl border p-4 mb-4 ${
            verified ? 'border-gray-200' : 'border-gray-100 opacity-50'
          }`}
        >
          <div className="flex items-start gap-3">
            <span
              className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                acceptedTerms
                  ? 'bg-emerald-100 text-emerald-600'
                  : verified
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-400'
              }`}
            >
              <i className={`fa-solid ${acceptedTerms ? 'fa-check' : 'fa-2'} text-xs`} />
            </span>
            <div className="flex-1">
              <div className="text-sm font-semibold text-gray-900 mb-2">
                Agree to host responsibilities
              </div>
              <ul className="space-y-1.5 text-xs text-gray-600 mb-3">
                <li className="flex items-start gap-2">
                  <i className="fa-solid fa-check text-emerald-500 mt-0.5" />
                  <span>I will provide honest descriptions and accurate photos.</span>
                </li>
                <li className="flex items-start gap-2">
                  <i className="fa-solid fa-check text-emerald-500 mt-0.5" />
                  <span>I am responsible for the condition and availability of what I list.</span>
                </li>
                <li className="flex items-start gap-2">
                  <i className="fa-solid fa-check text-emerald-500 mt-0.5" />
                  <span>I will respond to renter messages within 24 hours.</span>
                </li>
                <li className="flex items-start gap-2">
                  <i className="fa-solid fa-check text-emerald-500 mt-0.5" />
                  <span>RentAI keeps 10% commission on each completed booking.</span>
                </li>
              </ul>
              <label className="flex items-start gap-2 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  disabled={!verified}
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500 disabled:cursor-not-allowed"
                />
                <span className="text-gray-700">
                  I have read and agree to the host responsibilities above.
                </span>
              </label>
            </div>
          </div>
        </div>

        {errorMessage && (
          <p className="mb-3 text-sm text-red-600">
            <i className="fa-solid fa-circle-exclamation mr-1" />
            {errorMessage}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm()}
            disabled={!verified || !acceptedTerms || isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? (
              <>
                <i className="fa-solid fa-circle-notch fa-spin text-xs" />
                Setting up…
              </>
            ) : (
              <>
                <i className="fa-solid fa-rocket text-xs" />
                Become a host
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
