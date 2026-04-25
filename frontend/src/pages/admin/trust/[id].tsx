import { AdminLayout } from '@/components/admin/AdminLayout';
import { useAdminUserTrustProfile } from '@/lib/api/hooks/useAdminUserTrustProfile';
import { 
  useAdminMarkTrustReviewed, 
  useAdminUpdateTrustTier 
} from '@/lib/api/hooks/useAdminTrustActions';
import { useAdminModerateUser } from '@/lib/api/hooks/useAdminModerateUser';
import { useRouter } from 'next/router';
import { useState } from 'react';
import Link from 'next/link';
import { 
  ShieldAlert, 
  ChevronLeft, 
  History, 
  MessageSquare, 
  Info,
  Clock,
  AlertOctagon,
  ShieldCheck,
  ExternalLink,
  CheckCircle2,
  Lock,
  UserX
} from 'lucide-react';
import { format } from 'date-fns';

export default function UserTrustDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const { data: profile, isLoading, refetch } = useAdminUserTrustProfile(id as string);
  
  const markReviewed = useAdminMarkTrustReviewed();
  const updateTier = useAdminUpdateTrustTier();
  const moderateUser = useAdminModerateUser();

  const [tierReason, setTierReason] = useState('');
  const [selectedTier, setSelectedTier] = useState<string | null>(null);

  const getSeverityColor = (sev: string) => {
    switch (sev.toLowerCase()) {
      case 'critical': return 'text-red-700 bg-red-100';
      case 'high': return 'text-red-600 bg-red-50';
      case 'medium': return 'text-orange-600 bg-orange-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const handleMarkReviewed = async () => {
    if (!profile) return;
    try {
      await markReviewed.mutateAsync({ userId: id as string, reason: 'Manual review completed.' });
      router.push('/admin/trust');
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateTier = async () => {
    if (!tierReason) {
      alert('Please provide a reason for the tier override.');
      return;
    }
    try {
      await updateTier.mutateAsync({ 
        userId: id as string, 
        tier: selectedTier === 'AUTOMATIC' ? null : selectedTier, 
        reason: tierReason 
      });
      setTierReason('');
      setSelectedTier(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSuspend = async () => {
    const reason = prompt('Enter reason for account suspension:');
    if (!reason) return;
    try {
       await moderateUser.mutateAsync({ userId: id as string, action: 'suspend', reason });
       refetch();
    } catch (err) {
       console.error(err);
    }
  };

  if (isLoading) return <div className="p-12 text-center">Loading profile...</div>;

  return (
    <AdminLayout
      activeTab="trust"
      title="User Trust Profile"
      subtitle={`Reviewing security footprint for user ${id}`}
    >
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <Link href="/admin/trust" className="text-sm text-gray-500 hover:text-blue-600 flex items-center transition">
            <ChevronLeft size={16} className="mr-1" />
            Back to Trust Queue
          </Link>

          <div className="flex space-x-3">
             {profile?.suspendedAt ? (
               <div className="px-4 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm font-bold flex items-center">
                 <Lock size={16} className="mr-2" />
                 Account Suspended
               </div>
             ) : (
               <button 
                 onClick={handleSuspend}
                 className="px-4 py-2 bg-white border border-red-200 text-red-600 hover:bg-red-50 rounded-lg text-sm font-bold flex items-center transition shadow-sm"
               >
                 <UserX size={16} className="mr-2" />
                 Suspend Account
               </button>
             )}
             
             <button 
               onClick={handleMarkReviewed}
               disabled={markReviewed.isPending}
               className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold flex items-center transition shadow-md disabled:opacity-50"
             >
               <CheckCircle2 size={16} className="mr-2" />
               {markReviewed.isPending ? 'Marking...' : 'Mark as Reviewed'}
             </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Summary & Actions */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center">
                <Info size={16} className="mr-2" />
                Current Trust State
              </h3>
              
              <div className={`p-4 rounded-lg border mb-6 ${
                profile?.tier === 'RESTRICTED' ? 'bg-red-50 border-red-100' : 
                profile?.tier === 'SUSPICIOUS' ? 'bg-orange-50 border-orange-100' : 'bg-blue-50 border-blue-100'
              }`}>
                <div className="flex items-center justify-between mb-1">
                   <p className="text-xs font-bold text-gray-500 uppercase">Effective Tier</p>
                   {(profile as any)?.manualTier && (
                     <span className="text-[10px] font-black bg-white/50 text-gray-600 px-1.5 py-0.5 rounded border border-black/5">MANUAL</span>
                   )}
                </div>
                <p className={`text-2xl font-black ${
                  profile?.tier === 'RESTRICTED' ? 'text-red-700' : 
                  profile?.tier === 'SUSPICIOUS' ? 'text-orange-700' : 'text-blue-700'
                }`}>
                  {profile?.tier}
                </p>
              </div>

              <div className="space-y-4">
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <h4 className="text-xs font-bold text-gray-500 uppercase mb-3">Manual Tier Override</h4>
                  <div className="space-y-3">
                    <select 
                      className="w-full bg-white border border-gray-300 rounded px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                      value={selectedTier || (profile as any)?.manualTier || 'AUTOMATIC'}
                      onChange={(e) => setSelectedTier(e.target.value)}
                    >
                      <option value="AUTOMATIC">Automatic Score</option>
                      <option value="NORMAL">Always Normal</option>
                      <option value="LIMITED">Always Limited</option>
                      <option value="SUSPICIOUS">Forced Suspicious</option>
                      <option value="RESTRICTED">Forced Restricted</option>
                    </select>
                    {selectedTier && selectedTier !== ((profile as any)?.manualTier || 'AUTOMATIC') && (
                      <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                        <textarea 
                          placeholder="Reason for override..."
                          className="w-full bg-white border border-gray-300 rounded p-2 text-xs h-16 outline-none focus:ring-2 focus:ring-blue-500"
                          value={tierReason}
                          onChange={(e) => setTierReason(e.target.value)}
                        />
                        <button 
                          onClick={handleUpdateTier}
                          disabled={updateTier.isPending}
                          className="w-full bg-gray-800 text-white rounded py-2 text-xs font-bold hover:bg-black transition"
                        >
                          {updateTier.isPending ? 'Updating...' : 'Set Manual Tier'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-bold text-gray-400 mb-2 uppercase">Reasoning</p>
                  <ul className="space-y-2">
                    {profile?.reasons.map((r, i) => (
                      <li key={i} className="text-sm text-gray-700 flex items-start">
                        <AlertOctagon size={14} className="mr-2 mt-0.5 text-gray-400 shrink-0" />
                        {r}
                      </li>
                    ))}
                    {(!profile?.reasons || profile.reasons.length === 0) && (
                      <li className="text-sm text-gray-500 italic">No specific infractions noted.</li>
                    )}
                  </ul>
                </div>

                <div>
                  <p className="text-xs font-bold text-gray-400 mb-2 uppercase">Effective Restrictions</p>
                  <div className="flex flex-wrap gap-2">
                    {profile?.suggestedRestrictions.map((s, i) => (
                      <span key={i} className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-[10px] font-mono border border-gray-200 uppercase">
                        {s.replace(/_/g, ' ')}
                      </span>
                    ))}
                    {(!profile?.suggestedRestrictions || profile.suggestedRestrictions.length === 0) && (
                      <span className="text-sm text-gray-500 italic">None suggested</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-gray-100">
                <Link 
                  href={`/admin/users/${id}`}
                  className="w-full inline-flex items-center justify-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
                >
                  View User Dossier
                  <ExternalLink size={14} className="ml-2" />
                </Link>
              </div>
            </div>
          </div>

          {/* Right Column: Security Events Log */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900 flex items-center">
                  <History size={16} className="mr-2 text-blue-600" />
                  Security Event Timeline
                </h3>
                <span className="text-xs text-gray-500 italic">Showing last {profile?.events.length} events</span>
              </div>

              <div className="divide-y divide-gray-100">
                {profile?.events.map((event) => (
                  <div key={event.id} className="p-6 hover:bg-gray-50 transition">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center">
                        <div className={`px-2 py-0.5 rounded text-[10px] font-black uppercase mr-3 ${getSeverityColor(event.severity)}`}>
                          {event.severity}
                        </div>
                        <h4 className="text-sm font-bold text-gray-900 font-mono tracking-tight">
                          {event.eventType}
                        </h4>
                      </div>
                      <div className="text-[10px] text-gray-400 flex items-center">
                        <Clock size={12} className="mr-1" />
                        {format(new Date(event.createdAt), 'MMM d, HH:mm:ss')}
                      </div>
                    </div>
                    
                    <p className="text-sm text-gray-600 mb-3 ml-[68px]">
                      {event.reasonCode}
                    </p>

                    <div className="ml-[68px] flex items-center space-x-4">
                      {event.conversationId && (
                        <div className="text-[11px] text-blue-600 font-medium flex items-center bg-blue-50 px-2 py-0.5 rounded">
                          <MessageSquare size={12} className="mr-1" />
                          Context: {event.conversationId.split('-')[0]}...
                        </div>
                      )}
                      {event.metadata && Object.keys(event.metadata).length > 0 && (
                        <div className="text-[11px] text-gray-500 font-mono italic">
                          Meta: {JSON.stringify(event.metadata)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                
                {(!profile?.events || profile.events.length === 0) && (
                  <div className="p-12 text-center text-gray-500">
                    <ShieldCheck size={48} className="mx-auto mb-4 text-green-200" />
                    <p>No security events recorded for this user.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </AdminLayout>
  );
}
