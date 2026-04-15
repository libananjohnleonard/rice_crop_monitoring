import { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  Filter,
  LayoutGrid,
  List,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import type { AnalysisHistoryItem } from '../components/AnalysisResults';

const API_BASE_URL = 'http://localhost:3001';
const ITEMS_PER_PAGE = 8;

type SortOption = 'newest' | 'oldest' | 'category' | 'source';
type ViewMode = 'grid' | 'list';

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Unknown date';
  }

  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function categoryLabel(category: AnalysisHistoryItem['category']) {
  switch (category) {
    case 'whole_field':
      return 'Whole Field';
    case 'partial_field':
      return 'Partial Field';
    case 'close_up':
      return 'Close-up';
    default:
      return category;
  }
}

function sourceLabel(sourceType: AnalysisHistoryItem['sourceType']) {
  switch (sourceType) {
    case 'upload':
      return 'Upload';
    case 'wifi':
      return 'Wi-Fi';
    case 'bluetooth':
      return 'Bluetooth';
    case 'webcam':
      return 'Webcam';
    default:
      return sourceType;
  }
}

export function ManageUploadsPage() {
  const [items, setItems] = useState<AnalysisHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | AnalysisHistoryItem['category']>('all');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [currentPage, setCurrentPage] = useState(1);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const loadItems = async () => {
    try {
      setIsLoading(true);
      setError('');

      const response = await fetch(`${API_BASE_URL}/api/analyses`);
      if (!response.ok) {
        throw new Error('Failed to load uploads.');
      }

      const data: AnalysisHistoryItem[] = await response.json();
      setItems(data);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : 'Failed to load uploads.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadItems();
  }, []);

  const filteredItems = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    const nextItems = items.filter((item) => {
      const matchesCategory =
        categoryFilter === 'all' || item.category === categoryFilter;

      const haystack = [
        item.id,
        item.notes ?? '',
        categoryLabel(item.category),
        sourceLabel(item.sourceType),
        ...item.images.map((image, index) => image.file?.name ?? `Image ${index + 1}`),
      ]
        .join(' ')
        .toLowerCase();

      const matchesSearch =
        normalizedSearch.length === 0 || haystack.includes(normalizedSearch);

      return matchesCategory && matchesSearch;
    });

    nextItems.sort((left, right) => {
      if (sortBy === 'oldest') {
        return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
      }

      if (sortBy === 'category') {
        return categoryLabel(left.category).localeCompare(categoryLabel(right.category));
      }

      if (sortBy === 'source') {
        return sourceLabel(left.sourceType).localeCompare(sourceLabel(right.sourceType));
      }

      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    });

    return nextItems;
  }, [categoryFilter, items, search, sortBy]);

  useEffect(() => {
    setCurrentPage(1);
  }, [categoryFilter, search, sortBy]);

  useEffect(() => {
    setSelectedIds((current) => current.filter((id) => items.some((item) => item.id === id)));
  }, [items]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / ITEMS_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStart = (safeCurrentPage - 1) * ITEMS_PER_PAGE;
  const paginatedItems = filteredItems.slice(pageStart, pageStart + ITEMS_PER_PAGE);
  const allVisibleSelected =
    paginatedItems.length > 0 && paginatedItems.every((item) => selectedIds.includes(item.id));
  const hasSelection = selectedIds.length > 0;

  const toggleSelected = (batchId: string) => {
    setSelectedIds((current) =>
      current.includes(batchId)
        ? current.filter((id) => id !== batchId)
        : [...current, batchId]
    );
  };

  const toggleSelectVisible = () => {
    setSelectedIds((current) => {
      if (allVisibleSelected) {
        return current.filter((id) => !paginatedItems.some((item) => item.id === id));
      }

      const next = new Set(current);
      paginatedItems.forEach((item) => next.add(item.id));
      return [...next];
    });
  };

  const deleteBatchIds = async (
    batchIds: string[],
    confirmationMessage: string
  ) => {
    if (batchIds.length === 0) return;

    const confirmed = window.confirm(confirmationMessage);
    if (!confirmed) return;

    try {
      setIsBulkDeleting(true);
      setDeletingId(null);
      setError('');

      for (const batchId of batchIds) {
        const response = await fetch(`${API_BASE_URL}/api/analyses/${batchId}`, {
          method: 'DELETE',
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          throw new Error(errorData?.error || 'Failed to delete upload.');
        }
      }

      const idSet = new Set(batchIds);
      setItems((current) => current.filter((item) => !idSet.has(item.id)));
      setSelectedIds((current) => current.filter((id) => !idSet.has(id)));
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : 'Failed to delete upload.'
      );
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const handleDelete = async (batchId: string) => {
    const confirmed = window.confirm(
      'Delete this uploaded analysis and its saved images? This cannot be undone.'
    );

    if (!confirmed) return;

    try {
      setDeletingId(batchId);
      setError('');

      const response = await fetch(`${API_BASE_URL}/api/analyses/${batchId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || 'Failed to delete upload.');
      }

      setItems((current) => {
        const nextItems = current.filter((item) => item.id !== batchId);
        const nextFilteredCount = nextItems.filter((item) => {
          const matchesCategory =
            categoryFilter === 'all' || item.category === categoryFilter;

          const haystack = [
            item.id,
            item.notes ?? '',
            categoryLabel(item.category),
            sourceLabel(item.sourceType),
            ...item.images.map((image, index) => image.file?.name ?? `Image ${index + 1}`),
          ]
            .join(' ')
            .toLowerCase();

          const normalizedSearch = search.trim().toLowerCase();
          const matchesSearch =
            normalizedSearch.length === 0 || haystack.includes(normalizedSearch);

          return matchesCategory && matchesSearch;
        }).length;

        const nextTotalPages = Math.max(1, Math.ceil(nextFilteredCount / ITEMS_PER_PAGE));
        setCurrentPage((page) => Math.min(page, nextTotalPages));
        return nextItems;
      });
      setSelectedIds((current) => current.filter((id) => id !== batchId));
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : 'Failed to delete upload.'
      );
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-emerald-200 bg-white/90 p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-600">
              Manage Uploads
            </p>
            <h2 className="mt-1 text-2xl font-bold text-emerald-950">
              Organize saved image analyses
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-emerald-700">
              Review uploaded analyses, sort them by category or date, search through notes and image names, and remove entries you no longer want to keep.
            </p>
          </div>

          <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
            {filteredItems.length} of {items.length} upload{items.length === 1 ? '' : 's'}
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-emerald-200 bg-white/90 p-5 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_220px_220px]">
          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
              <Search className="h-4 w-4" />
              Search
            </span>
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
              placeholder="Search by note, category, source, or image name"
              className="w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-emerald-950 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            />
          </label>

          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
              <Filter className="h-4 w-4" />
              Category
            </span>
            <select
              value={categoryFilter}
              onChange={(event) =>
                setCategoryFilter(event.currentTarget.value as typeof categoryFilter)
              }
              className="w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-emerald-950 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            >
              <option value="all">All categories</option>
              <option value="whole_field">Whole Field</option>
              <option value="partial_field">Partial Field</option>
              <option value="close_up">Close-up</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
              <Calendar className="h-4 w-4" />
              Sort
            </span>
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.currentTarget.value as SortOption)}
              className="w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-emerald-950 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="category">Category</option>
              <option value="source">Source type</option>
            </select>
          </label>
        </div>

        <div className="mt-4 flex flex-col gap-3 border-t border-emerald-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-emerald-700">
            Showing {filteredItems.length === 0 ? 0 : pageStart + 1}-
            {Math.min(pageStart + paginatedItems.length, filteredItems.length)} of {filteredItems.length}
          </div>

          <div className="flex w-full flex-col gap-3 sm:w-auto sm:items-end">
            <div className="inline-flex w-full rounded-2xl border border-emerald-200 bg-emerald-50 p-1 sm:w-auto">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition sm:flex-none ${
                  viewMode === 'grid'
                    ? 'bg-emerald-700 text-white'
                    : 'text-emerald-700 hover:bg-white'
                }`}
              >
                <LayoutGrid className="h-4 w-4" />
                Default View
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition sm:flex-none ${
                  viewMode === 'list'
                    ? 'bg-emerald-700 text-white'
                    : 'text-emerald-700 hover:bg-white'
                }`}
              >
                <List className="h-4 w-4" />
                List View
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={toggleSelectVisible}
                disabled={paginatedItems.length === 0 || isBulkDeleting}
                className="rounded-xl border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {allVisibleSelected ? 'Unselect Visible' : 'Select Visible'}
              </button>
              <button
                type="button"
                onClick={() =>
                  void deleteBatchIds(
                    selectedIds,
                    `Delete ${selectedIds.length} selected upload${selectedIds.length === 1 ? '' : 's'}? This cannot be undone.`
                  )
                }
                disabled={!hasSelection || isBulkDeleting}
                className="rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isBulkDeleting ? 'Deleting...' : `Delete Selected (${selectedIds.length})`}
              </button>
              <button
                type="button"
                onClick={() =>
                  void deleteBatchIds(
                    filteredItems.map((item) => item.id),
                    `Delete all ${filteredItems.length} filtered upload${filteredItems.length === 1 ? '' : 's'}? This cannot be undone.`
                  )
                }
                disabled={filteredItems.length === 0 || isBulkDeleting}
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isBulkDeleting ? 'Deleting...' : 'Delete All'}
              </button>
            </div>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="rounded-3xl border border-emerald-200 bg-white/90 p-5 shadow-sm">
        {isLoading ? (
          <div className="flex min-h-[220px] items-center justify-center text-sm text-emerald-700">
            Loading uploads...
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 text-center">
            <div className="rounded-full bg-emerald-50 p-4 text-emerald-700">
              <Upload className="h-6 w-6" />
            </div>
            <div>
              <p className="font-semibold text-emerald-900">No uploads found</p>
              <p className="mt-1 text-sm text-emerald-700">
                Try a different search or filter, or add a new analysis from the home page.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {viewMode === 'grid' ? (
              paginatedItems.map((item) => (
                <article
                  key={item.id}
                  className="rounded-2xl border border-emerald-200 bg-emerald-50/35 p-4"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-emerald-700">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(item.id)}
                            onChange={() => toggleSelected(item.id)}
                            disabled={isBulkDeleting}
                            className="h-4 w-4 rounded border-emerald-300 text-emerald-700 focus:ring-emerald-200"
                          />
                          Select
                        </label>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-emerald-700">
                          {categoryLabel(item.category)}
                        </span>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-emerald-700">
                          {sourceLabel(item.sourceType)}
                        </span>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-emerald-700">
                          {item.images.length} image{item.images.length === 1 ? '' : 's'}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-emerald-950">
                            Upload ID: {item.id}
                          </p>
                          <p className="mt-1 text-sm text-emerald-700">
                            Saved {formatDate(item.createdAt)}
                          </p>
                          <p className="mt-2 text-sm text-emerald-800">
                            {item.notes?.trim() || 'No notes provided for this upload.'}
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-sm text-emerald-800 sm:grid-cols-4">
                          <div className="rounded-xl bg-white px-3 py-2">
                            <p className="text-[11px] uppercase tracking-[0.14em] text-emerald-600">
                              Health
                            </p>
                            <p className="mt-1 font-semibold">{item.result.healthScore}</p>
                          </div>
                          <div className="rounded-xl bg-white px-3 py-2">
                            <p className="text-[11px] uppercase tracking-[0.14em] text-emerald-600">
                              Status
                            </p>
                            <p className="mt-1 font-semibold">{item.result.status}</p>
                          </div>
                          <div className="rounded-xl bg-white px-3 py-2">
                            <p className="text-[11px] uppercase tracking-[0.14em] text-emerald-600">
                              Grid
                            </p>
                            <p className="mt-1 font-semibold">{item.result.gridEstimate ?? 'N/A'}</p>
                          </div>
                          <div className="rounded-xl bg-white px-3 py-2">
                            <p className="text-[11px] uppercase tracking-[0.14em] text-emerald-600">
                              Harvest
                            </p>
                            <p className="mt-1 font-semibold">
                              {item.result.harvestStatus ?? 'Not Ready'}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-3">
                        {item.images.map((image, index) => (
                          <div
                            key={image.id ?? `${item.id}-${index}`}
                            className="w-24 overflow-hidden rounded-xl border border-emerald-200 bg-white"
                          >
                            <img
                              src={image.preview}
                              alt={`Upload ${index + 1}`}
                              className="h-20 w-full object-cover"
                            />
                            <div className="px-2 py-1.5 text-[11px] font-medium text-emerald-700">
                              Image {index + 1}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-start">
                      <button
                        type="button"
                        onClick={() => handleDelete(item.id)}
                        disabled={deletingId === item.id || isBulkDeleting}
                        className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Trash2 className="h-4 w-4" />
                        {deletingId === item.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <div className="overflow-hidden rounded-2xl border border-emerald-200 bg-white">
                <div className="hidden grid-cols-[84px_minmax(0,1.5fr)_160px_140px_120px] gap-4 border-b border-emerald-100 bg-emerald-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700 md:grid">
                  <div>Select</div>
                  <div>Upload</div>
                  <div>Category</div>
                  <div>Saved</div>
                  <div className="text-right">Action</div>
                </div>
                {paginatedItems.map((item) => (
                  <article
                    key={item.id}
                    className="border-t border-emerald-100 px-4 py-4 first:border-t-0"
                  >
                    <div className="grid gap-3 md:grid-cols-[84px_minmax(0,1.5fr)_160px_140px_120px] md:items-center md:gap-4">
                      <div>
                        <label className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(item.id)}
                            onChange={() => toggleSelected(item.id)}
                            disabled={isBulkDeleting}
                            className="h-4 w-4 rounded border-emerald-300 text-emerald-700 focus:ring-emerald-200"
                          />
                          Select
                        </label>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-start gap-3">
                          {item.images[0] ? (
                            <img
                              src={item.images[0].preview}
                              alt="Upload preview"
                              className="h-16 w-16 shrink-0 rounded-xl border border-emerald-200 object-cover"
                            />
                          ) : null}
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-emerald-950">
                              Upload ID: {item.id}
                            </p>
                            <p className="mt-1 truncate text-sm text-emerald-700">
                              {item.notes?.trim() || 'No notes provided for this upload.'}
                            </p>
                            <p className="mt-1 text-xs text-emerald-600">
                              {sourceLabel(item.sourceType)} • {item.images.length} image
                              {item.images.length === 1 ? '' : 's'} • Health {item.result.healthScore}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="text-sm font-medium text-emerald-800">
                        {categoryLabel(item.category)}
                      </div>

                      <div className="text-sm text-emerald-700">
                        {formatDate(item.createdAt)}
                      </div>

                      <div className="flex md:justify-end">
                        <button
                          type="button"
                          onClick={() => handleDelete(item.id)}
                          disabled={deletingId === item.id || isBulkDeleting}
                          className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Trash2 className="h-4 w-4" />
                          {deletingId === item.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}

            <div className="flex flex-col gap-3 border-t border-emerald-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-emerald-700">
                Page {safeCurrentPage} of {totalPages}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={safeCurrentPage === 1}
                  className="rounded-xl border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  disabled={safeCurrentPage === totalPages}
                  className="rounded-xl border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
