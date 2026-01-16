import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/router';
import { HostLayout } from '@/components/host/HostLayout';
import { useListing } from '@/lib/api/hooks/useListing';
import { api } from '@/lib/api/http';
import { LoadingCard } from '@/components/ui/LoadingCard';
import { InlineError } from '@/components/ui/InlineError';
import { EmptyState } from '@/components/ui/EmptyState';
import { toast } from '@/components/ui/Toaster';

interface ImagePreview {
  file: File;
  preview: string;
}

interface ExistingImage {
  url: string;
  id: string;
}

export default function HostEditListingPage() {
  const router = useRouter();
  const id = router.query.id as string | undefined;
  const listingQuery = useListing(id);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newImages, setNewImages] = useState<ImagePreview[]>([]);
  const [existingImages, setExistingImages] = useState<ExistingImage[]>([]);
  const [imagesToRemove, setImagesToRemove] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    categoryId: '',
    pricePerDay: '',
    address: '',
    latitude: '',
    longitude: '',
    rules: '',
  });

  // Load listing data
  useEffect(() => {
    if (listingQuery.data) {
      const listing = listingQuery.data as any;
      setFormData({
        title: listing.title || '',
        description: listing.description || '',
        categoryId: listing.categoryId || listing.category?.id || '',
        pricePerDay: String(listing.pricePerDay || ''),
        address: listing.address || '',
        latitude: listing.location?.coordinates?.[1] || '',
        longitude: listing.location?.coordinates?.[0] || '',
        rules: listing.rules || '',
      });
      // Set existing images
      if (listing.images && Array.isArray(listing.images)) {
        setExistingImages(
          listing.images.map((url: string, idx: number) => ({
            url,
            id: `existing-${idx}`,
          })),
        );
      }
    }
  }, [listingQuery.data]);

  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Validate total image count
    const totalImages = existingImages.length - imagesToRemove.length + newImages.length + files.length;
    if (totalImages > 5) {
      setError('Maximum 5 images allowed');
      return;
    }

    // Validate file types and sizes
    const validFiles: ImagePreview[] = [];
    for (const file of files) {
      if (!file.type.match(/^image\/(jpeg|jpg|png)$/)) {
        setError(`${file.name}: Only JPEG and PNG images are allowed`);
        continue;
      }
      if (file.size > 5 * 1024 * 1024) {
        setError(`${file.name}: File size must be less than 5MB`);
        continue;
      }
      validFiles.push({
        file,
        preview: URL.createObjectURL(file),
      });
    }

    if (validFiles.length > 0) {
      setNewImages((prev) => [...prev, ...validFiles]);
      setError(null);
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [existingImages.length, imagesToRemove.length, newImages.length]);

  const handleRemoveNewImage = useCallback((index: number) => {
    setNewImages((prev) => {
      const newList = [...prev];
      URL.revokeObjectURL(newList[index].preview);
      newList.splice(index, 1);
      return newList;
    });
  }, []);

  const handleRemoveExistingImage = useCallback((url: string) => {
    setExistingImages((prev) => prev.filter((img) => img.url !== url));
    setImagesToRemove((prev) => [...prev, url]);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    const remainingImages = existingImages.length - imagesToRemove.length + newImages.length;
    if (remainingImages === 0) {
      setError('At least one image is required');
      return;
    }
    if (!formData.title.trim()) {
      setError('Title is required');
      return;
    }
    if (!formData.description.trim()) {
      setError('Description is required');
      return;
    }
    if (!formData.pricePerDay || parseFloat(formData.pricePerDay) <= 0) {
      setError('Valid price is required');
      return;
    }

    setIsUploading(true);

    try {
      // Create FormData
      const submitData = new FormData();
      submitData.append('title', formData.title);
      submitData.append('description', formData.description);
      if (formData.pricePerDay) {
        submitData.append('pricePerDay', formData.pricePerDay);
      }
      if (formData.address) {
        submitData.append('address', formData.address);
      }
      if (formData.latitude && formData.longitude) {
        submitData.append('latitude', formData.latitude);
        submitData.append('longitude', formData.longitude);
      }
      if (formData.rules) {
        submitData.append('rules', formData.rules);
      }

      // Append images to remove
      if (imagesToRemove.length > 0) {
        imagesToRemove.forEach((url) => {
          submitData.append('imagesToRemove', url);
        });
      }

      // Append new images
      newImages.forEach((img) => {
        submitData.append('images', img.file);
      });

      await api.patch(`/listings/${id}`, submitData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      // Clean up preview URLs
      newImages.forEach((img) => URL.revokeObjectURL(img.preview));

      toast({
        title: 'Success',
        message: 'Listing updated successfully!',
        variant: 'success',
      });

      // Redirect to listings page
      router.push('/host/listings');
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        'Failed to update listing';
      setError(errorMessage);
    } finally {
      setIsUploading(false);
    }
  };

  if (listingQuery.isLoading) {
    return (
      <HostLayout>
        <div className="mx-auto max-w-4xl px-6 py-12">
          <LoadingCard />
        </div>
      </HostLayout>
    );
  }

  if (listingQuery.isError) {
    return (
      <HostLayout>
        <div className="mx-auto max-w-4xl px-6 py-12">
          <InlineError message="Failed to load listing for editing." onRetry={() => void listingQuery.refetch()} />
        </div>
      </HostLayout>
    );
  }

  if (!listingQuery.data) {
    return (
      <HostLayout>
        <div className="mx-auto max-w-4xl px-6 py-12">
          <EmptyState icon="fa-solid fa-pen" title="Listing not found" message="This listing is unavailable." />
        </div>
      </HostLayout>
    );
  }

  const allImages = [
    ...existingImages.filter((img) => !imagesToRemove.includes(img.url)),
    ...newImages.map((img, idx) => ({ url: img.preview, id: `new-${idx}` })),
  ];

  return (
    <HostLayout>
      <div className="bg-gray-50 font-sans">
        <section id="progress-indicator" className="bg-white border-b border-gray-200">
          <div className="max-w-4xl mx-auto px-6 py-4">
            <h1 className="text-2xl font-bold text-gray-900">Edit Listing</h1>
          </div>
        </section>

        <main id="edit-listing-main" className="max-w-4xl mx-auto px-6 py-12">
          <form onSubmit={handleSubmit}>
            {/* Image Upload Section */}
            <div id="step-photos" className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 mb-6">
              <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Photos</h1>
                <p className="text-gray-600">Manage your listing photos (up to 5 total)</p>
              </div>

              {/* Image Previews */}
              {allImages.length > 0 && (
                <div className="mb-6 grid grid-cols-2 md:grid-cols-3 gap-4">
                  {existingImages
                    .filter((img) => !imagesToRemove.includes(img.url))
                    .map((img, idx) => (
                      <div key={img.id} className="relative group">
                        <img
                          src={img.url.startsWith('http') ? img.url : `http://localhost:3000${img.url}`}
                          alt={`Existing ${idx + 1}`}
                          className="w-full h-48 object-cover rounded-lg border border-gray-200"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveExistingImage(img.url)}
                          className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white rounded-full w-8 h-8 flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                        >
                          <i className="fa-solid fa-times text-sm"></i>
                        </button>
                        <div className="absolute bottom-2 left-2 bg-blue-500 text-white text-xs px-2 py-1 rounded">
                          Existing
                        </div>
                      </div>
                    ))}
                  {newImages.map((img, idx) => (
                    <div key={`new-${idx}`} className="relative group">
                      <img
                        src={img.preview}
                        alt={`New ${idx + 1}`}
                        className="w-full h-48 object-cover rounded-lg border border-gray-200"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveNewImage(idx)}
                        className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white rounded-full w-8 h-8 flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                      >
                        <i className="fa-solid fa-times text-sm"></i>
                      </button>
                      <div className="absolute bottom-2 left-2 bg-green-500 text-white text-xs px-2 py-1 rounded">
                        New
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Upload Area */}
              {allImages.length < 5 && (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center hover:border-blue-400 transition cursor-pointer bg-gray-50"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/jpg,image/png"
                    multiple
                    onChange={handleImageSelect}
                    className="hidden"
                  />
                  <div className="flex flex-col items-center">
                    <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                      <i className="fa-solid fa-cloud-arrow-up text-blue-500 text-3xl" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Add more photos</h3>
                    <p className="text-sm text-gray-500 mb-4">or click to browse from your device</p>
                    <button
                      type="button"
                      className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg font-medium transition"
                    >
                      Choose files
                    </button>
                    <p className="text-xs text-gray-400 mt-4">
                      Supported formats: JPG, PNG (max 5MB each, {5 - allImages.length} more allowed)
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Details Section */}
            <div id="step-details" className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 mb-6">
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Listing Details</h2>
                <p className="text-gray-600">Update your listing information</p>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Title *</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="e.g., Modern 2-Bedroom Apartment in La Marsa"
                    maxLength={60}
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">{formData.title.length}/60 characters</p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Description *</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Describe your item in detail..."
                    rows={6}
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Price per day (TND) *</label>
                  <input
                    type="number"
                    value={formData.pricePerDay}
                    onChange={(e) => setFormData({ ...formData, pricePerDay: e.target.value })}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Address</label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="e.g., 123 Main Street, Kelibia, Tunisia"
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Latitude</label>
                    <input
                      type="number"
                      value={formData.latitude}
                      onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                      placeholder="36.8578"
                      step="any"
                      className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Longitude</label>
                    <input
                      type="number"
                      value={formData.longitude}
                      onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                      placeholder="11.0920"
                      step="any"
                      className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Rules (optional)</label>
                  <textarea
                    value={formData.rules}
                    onChange={(e) => setFormData({ ...formData, rules: e.target.value })}
                    placeholder="e.g., No smoking, No pets, Check-in after 2 PM..."
                    rows={4}
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Error Display */}
            {error && (
              <div className="mb-6">
                <InlineError message={error} onRetry={() => setError(null)} />
              </div>
            )}

            {/* Submit Button */}
            <div className="flex justify-end gap-4">
              <button
                type="button"
                onClick={() => router.back()}
                className="px-6 py-3 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition"
                disabled={isUploading}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isUploading || allImages.length === 0}
                className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUploading ? 'Updating...' : 'Update Listing'}
              </button>
            </div>
          </form>
        </main>
      </div>
    </HostLayout>
  );
}
