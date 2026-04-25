import React from 'react';
import Link from 'next/link';

export function ChatbotToolResultRenderer({ toolName, result }: { toolName: string, result: any }) {
  if (!result || !result.output) return null;

  switch (toolName) {
    case 'search_listings':
    case 'get_host_listings': {
      const items = Array.isArray(result.output) ? result.output : result.output.data || result.output.listings;
      if (!items || !Array.isArray(items) || items.length === 0) {
        return <div className="text-sm italic text-slate-500">No listings found.</div>;
      }
      return (
        <div className="flex overflow-x-auto gap-4 pb-2 snap-x">
          {items.map((listing: any) => (
            <div key={listing.id} className="min-w-[200px] w-[200px] bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col snap-start">
              {listing.images && listing.images.length > 0 ? (
                <div className="h-28 bg-slate-100 overflow-hidden relative">
                  <img src={listing.images[0]} alt={listing.title} className="object-cover w-full h-full" />
                </div>
              ) : (
                <div className="h-28 bg-slate-100 flex items-center justify-center">
                  <i className="fa-solid fa-image text-slate-300 text-2xl" />
                </div>
              )}
              <div className="p-3 flex-1 flex flex-col">
                <h5 className="font-semibold text-xs text-slate-900 line-clamp-1 mb-1">{listing.title}</h5>
                <p className="text-[10px] text-slate-500 line-clamp-1 mb-2 capitalize">{listing.category}</p>
                <div className="mt-auto">
                  <p className="text-xs font-bold text-slate-900">{listing.price} TND <span className="font-normal text-slate-500">/ d</span></p>
                </div>
                <Link href={`/listing/${listing.id}`} className="mt-2 text-center text-[11px] font-semibold text-blue-600 bg-blue-50 py-1.5 rounded-md hover:bg-blue-100 transition">
                  View Details
                </Link>
              </div>
            </div>
          ))}
        </div>
      );
    }
    
    case 'get_my_bookings':
    case 'get_host_booking_requests': {
      const items = Array.isArray(result.output) ? result.output : result.output.data || result.output.bookings;
      if (!items || !Array.isArray(items) || items.length === 0) {
        return <div className="text-sm italic text-slate-500">No bookings found.</div>;
      }
      return (
        <div className="space-y-3">
          {items.map((booking: any) => {
             const statusColor = booking.status === 'confirmed' ? 'bg-green-100 text-green-800' : 
                                 booking.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 
                                 'bg-slate-100 text-slate-800';
             return (
               <div key={booking.id} className="bg-white border border-slate-200 rounded-lg p-3 text-sm shadow-sm flex items-center justify-between">
                 <div>
                   <h5 className="font-semibold">{booking.listing?.title || 'Listing'}</h5>
                   <p className="text-xs text-slate-500 mt-1">{new Date(booking.startDate).toLocaleDateString()} - {new Date(booking.endDate).toLocaleDateString()}</p>
                   {booking.totalPrice && <p className="text-xs font-medium mt-1">{booking.totalPrice} TND</p>}
                 </div>
                 <div className="flex flex-col items-end gap-2">
                   <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${statusColor}`}>{booking.status}</span>
                   <Link href={`/booking/${booking.id}`} className="text-xs text-blue-600 hover:underline">
                      Details <i className="fa-solid fa-chevron-right text-[10px]" />
                   </Link>
                 </div>
               </div>
             );
          })}
        </div>
      );
    }

    case 'get_listing_details': {
      const listing = result.output;
      return (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden max-w-sm shadow-sm">
           {listing.images && listing.images.length > 0 && (
             <img src={listing.images[0]} className="w-full h-32 object-cover" />
           )}
           <div className="p-4">
              <h4 className="font-bold text-slate-900">{listing.title}</h4>
              <p className="text-xs text-slate-500 mt-1"><i className="fa-solid fa-location-dot" /> {listing.location || 'Location hidden'}</p>
              <div className="mt-3 text-sm line-clamp-3 text-slate-700">{listing.description}</div>
              <div className="mt-4 flex gap-2">
                 <Link href={`/listing/${listing.id}`} className="flex-1 text-center bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold py-2 px-3 rounded-lg transition">
                    View
                 </Link>
              </div>
           </div>
        </div>
      );
    }

    case 'search_help_center': {
       const items = result.output;
       if (!items || !Array.isArray(items) || items.length === 0) return null;
       return (
          <div className="space-y-2 mt-2">
             <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Help Articles</h5>
             {items.slice(0,3).map((article: any, idx: number) => (
               <Link href={article.url || '/help'} key={idx} className="block p-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition shadow-sm">
                  <h6 className="text-sm font-semibold text-blue-700 mb-1">{article.title}</h6>
                  <p className="text-xs text-slate-600 line-clamp-2">{article.snippet}</p>
               </Link>
             ))}
          </div>
       );
    }

    // Generic safe fallback for simple output (like string success messages)
    // Generic safe fallback for simple output (like string success messages)
    default:
      if (typeof result.output === 'string') {
        return <div className="text-sm bg-slate-50 p-3 rounded-lg text-slate-700 italic border border-slate-100">{result.output}</div>;
      }
      if (typeof result.output === 'object' && result.output !== null) {
        // Look for common safe messages inside the object
        const message = result.output.message || result.output.detail || result.output.statusDetail;
        if (message && typeof message === 'string') {
           return (
             <div className="text-sm bg-green-50 p-3 rounded-lg text-green-800 border border-green-100 flex items-start gap-2">
                <i className="fa-solid fa-circle-check mt-0.5" />
                <p>{message}</p>
             </div>
           );
        }
      }
      return null;
  }
}
