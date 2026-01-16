import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import { HostLayout } from '@/components/host/HostLayout';
import { api } from '@/lib/api/http';
import { InlineError } from '@/components/ui/InlineError';
import { toast } from '@/components/ui/Toaster';
import { useCategories } from '@/lib/api/hooks/useCategories';

interface ImagePreview {
  file: File;
  preview: string;
}

export default function HostCreatePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const categoriesQuery = useCategories();
  const [images, setImages] = useState<ImagePreview[]>([]);
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

  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Validate file count
    if (images.length + files.length > 5) {
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
      setImages((prev) => [...prev, ...validFiles]);
      setError(null);
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [images.length]);

  const handleRemoveImage = useCallback((index: number) => {
    setImages((prev) => {
      const newImages = [...prev];
      URL.revokeObjectURL(newImages[index].preview);
      newImages.splice(index, 1);
      return newImages;
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (images.length === 0) {
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
    if (!formData.categoryId) {
      setError('Category is required');
      return;
    }
    if (!formData.pricePerDay || parseFloat(formData.pricePerDay) <= 0) {
      setError('Valid price is required');
      return;
    }
    if (!formData.address.trim()) {
      setError('Address is required');
      return;
    }
    if (!formData.latitude || !formData.longitude) {
      setError('Location coordinates are required');
      return;
    }

    setIsUploading(true);

    try {
      // Create FormData
      const submitData = new FormData();
      submitData.append('title', formData.title);
      submitData.append('description', formData.description);
      submitData.append('categoryId', formData.categoryId);
      submitData.append('pricePerDay', formData.pricePerDay);
      submitData.append('address', formData.address);
      submitData.append('latitude', formData.latitude);
      submitData.append('longitude', formData.longitude);
      if (formData.rules) {
        submitData.append('rules', formData.rules);
      }

      // Append images
      images.forEach((img) => {
        submitData.append('images', img.file);
      });

      const response = await api.post('/listings', submitData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      // Clean up preview URLs
      images.forEach((img) => URL.revokeObjectURL(img.preview));

      toast({
        title: 'Success',
        message: 'Listing created successfully!',
        variant: 'success',
      });

      // Redirect to listings page
      router.push('/host/listings');
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        'Failed to create listing';
      setError(errorMessage);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <HostLayout>
      <div className="bg-gray-50 font-sans">
        <section id="progress-indicator" className="bg-white border-b border-gray-200">
          <div className="max-w-4xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-semibold">
                  1
                </div>
                <span className="text-sm font-medium text-gray-900">Photos</span>
              </div>
              <div className="flex-1 h-1 bg-gray-200 mx-4" />

              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-gray-500 text-sm font-semibold">
                  2
                </div>
                <span className="text-sm font-medium text-gray-500">Details</span>
              </div>
              <div className="flex-1 h-1 bg-gray-200 mx-4" />

              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-gray-500 text-sm font-semibold">
                  3
                </div>
                <span className="text-sm font-medium text-gray-500">Category</span>
              </div>
              <div className="flex-1 h-1 bg-gray-200 mx-4" />

              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-gray-500 text-sm font-semibold">
                  4
                </div>
                <span className="text-sm font-medium text-gray-500">Availability</span>
              </div>
            </div>
          </div>
        </section>

        <main id="create-listing-main" className="max-w-4xl mx-auto px-6 py-12">
          <form onSubmit={handleSubmit}>
            {/* Image Upload Section */}
            <div id="step-photos" className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 mb-6">
              <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Add photos of your item</h1>
                <p className="text-gray-600">Upload at least 1 photo (up to 5) to help renters see what you're offering</p>
              </div>

              {/* Image Previews */}
              {images.length > 0 && (
                <div className="mb-6 grid grid-cols-2 md:grid-cols-3 gap-4">
                  {images.map((img, idx) => (
                    <div key={idx} className="relative group">
                      <img
                        src={img.preview}
                        alt={`Preview ${idx + 1}`}
                        className="w-full h-48 object-cover rounded-lg border border-gray-200"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveImage(idx)}
                        className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white rounded-full w-8 h-8 flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                      >
                        <i className="fa-solid fa-times text-sm"></i>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Upload Area */}
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
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Drag and drop your photos here</h3>
                  <p className="text-sm text-gray-500 mb-4">or click to browse from your device</p>
                  <button
                    type="button"
                    className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg font-medium transition"
                  >
                    Choose files
                  </button>
                  <p className="text-xs text-gray-400 mt-4">
                    Supported formats: JPG, PNG (max 5MB each, up to 5 images)
                  </p>
                </div>
              </div>
            </div>

            {/* Details Section */}
            <div id="step-details" className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 mb-6">
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Tell us about your item</h2>
                <p className="text-gray-600">Provide clear information to help renters understand what you're offering</p>
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
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Category *</label>
                  <select
                    value={formData.categoryId}
                    onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                    disabled={categoriesQuery.isLoading}
                  >
                    <option value="">Select a category</option>
                    {categoriesQuery.data?.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                  {categoriesQuery.isError && (
                    <p className="text-xs text-red-500 mt-1">Failed to load categories</p>
                  )}
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
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Address *</label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="e.g., 123 Main Street, Kelibia, Tunisia"
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Latitude *</label>
                    <input
                      type="number"
                      value={formData.latitude}
                      onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                      placeholder="36.8578"
                      step="any"
                      className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Longitude *</label>
                    <input
                      type="number"
                      value={formData.longitude}
                      onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                      placeholder="11.0920"
                      step="any"
                      className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
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
                disabled={isUploading || images.length === 0}
                className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUploading ? 'Publishing...' : 'Publish Listing'}
              </button>
            </div>
          </form>
        </main>
      </div>
    </HostLayout>
  );
}
