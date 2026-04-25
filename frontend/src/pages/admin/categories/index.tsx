import { useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { useAdminCategories } from '@/lib/api/hooks/useAdminCategories';
import { LoadingCard } from '@/components/ui/LoadingCard';
import { InlineError } from '@/components/ui/InlineError';
import { EmptyState } from '@/components/ui/EmptyState';
import { CategoriesService } from '@/lib/api/generated';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/Toaster';

export default function AdminCategoriesPage() {
  const queryClient = useQueryClient();
  const q = useAdminCategories();
  const raw = (q.data as any) ?? [];
  const items: any[] = Array.isArray(raw) ? raw : (raw?.items ?? []);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<any | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    icon: '',
    isActive: true,
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      return CategoriesService.categoriesControllerUpdate(id, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'categories'] });
      toast({ title: 'Success', message: 'Category status updated.', variant: 'success' });
    },
    onError: () => {
      toast({ title: 'Error', message: 'Failed to update category status.', variant: 'error' });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editingCategory) {
        return CategoriesService.categoriesControllerUpdate(editingCategory.id, {
          name: formData.name,
          slug: formData.slug || undefined,
          icon: formData.icon || undefined,
          isActive: formData.isActive,
          allowedForPrivate: true,
        });
      } else {
        return CategoriesService.categoriesControllerCreate({
          name: formData.name,
          slug: formData.slug || undefined,
          icon: formData.icon || undefined,
          isActive: formData.isActive,
          allowedForPrivate: true,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'categories'] });
      toast({ title: 'Success', message: 'Category saved successfully.', variant: 'success' });
      setIsModalOpen(false);
      setEditingCategory(null);
    },
    onError: (err: any) => {
      toast({ title: 'Error', message: err?.body?.message || err?.message || 'Failed to save.', variant: 'error' });
    },
  });

  const handleEdit = (cat: any) => {
    setEditingCategory(cat);
    setFormData({
      name: cat.name || '',
      slug: cat.slug || '',
      icon: cat.icon || '',
      isActive: cat.isActive !== false,
    });
    setIsModalOpen(true);
  };

  const handleCreate = () => {
    setEditingCategory(null);
    setFormData({
      name: '',
      slug: '',
      icon: '',
      isActive: true,
    });
    setIsModalOpen(true);
  };

  return (
    <AdminLayout activeTab="categories" title="Categories" subtitle="Manage taxonomy and listing classification">
      <section className="py-6">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex justify-end mb-6 space-x-3">
            <a
              href="/admin/categories/requests"
              className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg font-medium shadow-sm transition"
            >
              View Requests
            </a>
            <button
              onClick={handleCreate}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium shadow transition"
            >
              + Create Category
            </button>
          </div>

          {q.isError ? (
            <div className="mb-4">
              <InlineError message="Failed to load categories." onRetry={() => void q.refetch()} />
            </div>
          ) : null}

          {q.isLoading ? (
            <LoadingCard variant="table" rows={6} columns={4} />
          ) : items.length === 0 ? (
            <EmptyState
              icon="fa-solid fa-list"
              title="No categories found"
              message="Create a category to get started."
            />
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase">Name</th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase">Slug</th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase">Status</th>
                    <th className="text-right px-6 py-4 text-xs font-semibold text-gray-600 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {items.map((cat: any) => (
                    <tr key={cat.id} className="hover:bg-gray-50 transition">
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          {cat.icon && <i className={`${cat.icon} text-gray-400 mr-3`} />}
                          <p className="font-semibold text-gray-900">{cat.name}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-gray-500">{cat.slug}</p>
                      </td>
                      <td className="px-6 py-4">
                        {cat.isActive !== false ? (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                            <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-2" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full mr-2" />
                            Disabled
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleEdit(cat)}
                          className="text-blue-600 hover:text-blue-900 font-medium text-sm mr-4"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => toggleMutation.mutate({ id: cat.id, isActive: cat.isActive === false })}
                          disabled={toggleMutation.isPending}
                          className={`text-sm font-medium ${
                            cat.isActive !== false ? 'text-orange-600 hover:text-orange-900' : 'text-green-600 hover:text-green-900'
                          }`}
                        >
                          {cat.isActive !== false ? 'Disable' : 'Enable'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Modal Form */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-gray-900">{editingCategory ? 'Edit Category' : 'Create Category'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <i className="fa-solid fa-times" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
                <input
                  type="text"
                  placeholder="Auto-generated if empty"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Icon (FontAwesome Class)</label>
                <input
                  type="text"
                  placeholder="e.g., fa-solid fa-car"
                  value={formData.icon}
                  onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
              <div className="flex items-center mt-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                />
                <label htmlFor="isActive" className="ml-2 block text-sm text-gray-900">
                  Active (Hosts can select it)
                </label>
              </div>
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || !formData.name.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
              >
                {saveMutation.isPending ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
