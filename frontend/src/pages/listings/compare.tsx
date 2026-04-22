import { Layout } from '@/components/layout/Layout';
import { useRouter } from 'next/router';
import { useCompareListings } from '@/lib/api/hooks/useCompareListings';
import { formatTnd } from '@/lib/utils/format';
import Link from 'next/link';
import { ChevronLeft, Info, Star, ShieldCheck, MapPin, Tag } from 'lucide-react';

import { useCompare } from '@/lib/context/CompareContext';
import { useEffect } from 'react';

export default function ComparePage() {
  const router = useRouter();
  const { toggleListing } = useCompare();
  const ids = typeof router.query.ids === 'string' ? router.query.ids.split(',') : [];

  const { data, isLoading } = useCompareListings(ids);
  const listings = data?.listings || [];
  const insights = data?.insights || null;

  // Sync: Remove IDs that were not found from selection context
  useEffect(() => {
    if (!isLoading && listings.length > 0 && ids.length > 0) {
      const foundIds = listings.map((l: any) => l.id);
      const missingIds = ids.filter((id: string) => !foundIds.includes(id));
      missingIds.forEach((id: string) => toggleListing(id));
    }
  }, [isLoading, listings, ids, toggleListing]);

  if (isLoading) return (
    <Layout>
      <div className="mx-auto max-w-7xl px-6 py-12 text-center">Loading comparison...</div>
    </Layout>
  );

  if (!listings || listings.length === 0) return (
    <Layout>
        <div className="mx-auto max-w-7xl px-6 py-24 text-center">
            <h2 className="text-2xl font-bold">No listings selected for comparison</h2>
            <Link href="/search" className="mt-4 inline-block text-blue-600 hover:underline">Back to search</Link>
        </div>
    </Layout>
  );

  const features = [
    { label: 'Price', key: 'pricePerDay', format: (val: any) => `${formatTnd(val)} / day`, icon: Tag },
    { label: 'Category', key: 'category', format: (val: any) => val?.name || '-', icon: Info },
    { label: 'Rating', key: 'host', format: (val: any) => val?.ratingAvg ? `${val.ratingAvg} (${val.ratingCount || 0})` : 'No ratings', icon: Star },
    { label: 'Booking Type', key: 'bookingType', format: (val: any) => val === 'DAILY' ? 'Daily Rental' : 'Slot Based', icon: Info },
    { label: 'Location', key: 'address', format: (val: any) => val?.split(',').slice(-1)[0].trim() || '-', icon: MapPin },
    { label: 'Description', key: 'description', format: (val: any) => val ? (val.length > 100 ? val.substring(0, 100) + '...' : val) : '-', icon: Info },
  ];

  return (
    <Layout>
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="mb-8">
            <Link href="/search" className="text-sm text-slate-500 hover:text-blue-600 flex items-center transition">
                <ChevronLeft size={16} className="mr-1" />
                Back to Search
            </Link>
            <h1 className="mt-4 text-3xl font-black text-slate-900 tracking-tight">Compare Listings</h1>
            <p className="mt-1 text-slate-500">Evaluating {listings.length} options for your decision.</p>
        </div>

        <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-200/50">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="p-8 w-64 text-sm font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">Features</th>
                {listings.map((l: any) => (
                  <th key={l.id} className="p-8 border-b border-slate-100 min-w-[300px]">
                     <div className="aspect-[16/10] bg-slate-100 rounded-2xl overflow-hidden mb-6 shadow-sm border border-slate-200">
                        <img 
                          src={l.images?.[0]?.startsWith('http') ? l.images[0] : (l.images?.[0] ? `http://localhost:3000${l.images[0]}` : '/placeholder.png')} 
                          className="w-full h-full object-cover"
                          alt={l.title}
                        />
                     </div>
                     <Link href={`/listings/${l.id}`} className="text-lg font-black text-slate-900 hover:text-blue-600 transition block leading-tight">
                        {l.title}
                     </Link>
                     <div className="mt-4">
                        <Link href={`/listings/${l.id}`} className="inline-flex items-center justify-center w-full py-3 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-black transition">
                            View Details
                        </Link>
                     </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {features.map((f, i) => (
                <tr key={f.label} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}>
                  <td className="p-8 border-b border-slate-100">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-slate-500">
                         <f.icon size={16} />
                      </div>
                      <span className="font-bold text-slate-900">{f.label}</span>
                    </div>
                  </td>
                  {listings.map((l: any) => (
                    <td key={l.id} className="p-8 border-b border-slate-100">
                       <span className="text-slate-700 font-medium">{f.format((l as any)[f.key])}</span>
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <td className="p-8 bg-blue-50/30">
                    <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600">
                            <ShieldCheck size={16} />
                        </div>
                        <span className="font-bold text-blue-900 text-sm">Decision Guard</span>
                    </div>
                </td>
                {listings.map((l: any) => {
                    const isLowestPrice = insights?.bestValueId === l.id;
                    const isBestRated = insights?.bestRatedId === l.id;
                    const isMostExperienced = insights?.mostExperiencedHostId === l.id;
                    const isVerified = l.host?.verifiedEmail && l.host?.verifiedPhone;
                    const isSlot = l.bookingType === 'SLOT';

                    const summary = insights?.summaries?.[l.id] || "Standard alternative.";
                    const hasBadge = isLowestPrice || isBestRated || isMostExperienced || isVerified || isSlot;
                    
                    return (
                        <td key={l.id} className="p-8 bg-blue-50/30 align-top">
                            <div className="flex flex-wrap gap-2 mb-3">
                                {isLowestPrice && (
                                    <span className="px-2 py-1 bg-green-100 text-green-700 rounded-md text-[10px] font-black uppercase tracking-wider border border-green-200">
                                        Best Value
                                    </span>
                                )}
                                {isBestRated && (
                                    <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-md text-[10px] font-black uppercase tracking-wider border border-yellow-200">
                                        Top Rated Host
                                    </span>
                                )}
                                {isMostExperienced && (
                                    <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-md text-[10px] font-black uppercase tracking-wider border border-purple-200">
                                        Most Experienced
                                    </span>
                                )}
                                {isVerified && (
                                    <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-md text-[10px] font-black uppercase tracking-wider border border-blue-200">
                                        Verified Identity
                                    </span>
                                )}
                                {isSlot && (
                                    <span className="px-2 py-1 bg-teal-100 text-teal-700 rounded-md text-[10px] font-black uppercase tracking-wider border border-teal-200">
                                        Flexible Hourly
                                    </span>
                                )}
                                {!hasBadge && (
                                    <span className="text-[10px] text-slate-400 italic">Standard Offer</span>
                                )}
                            </div>
                            <p className="text-xs text-slate-600 leading-tight">
                                {summary}
                            </p>
                        </td>
                    );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
