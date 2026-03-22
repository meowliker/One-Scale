'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  CheckSquare,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Loader2,
  RefreshCw,
  AlertCircle,
  Search,
  Check,
  Plus,
  Trash2,
  Unlink,
  Package,
  List,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

interface ClickUpList {
  id: string;
  name: string;
  assignedProductId?: string;
  assignedProductName?: string;
}

interface StoreProduct {
  id: string;
  name: string;
}

interface ClickUpConnectionData {
  connected: boolean;
  workspaceName?: string;
  workspaceId?: string;
  lists: ClickUpList[];
  readyStatus?: string;
}

interface ClickUpConnectionDetailsProps {
  storeId: string;
  storeName: string;
  onDisconnect?: () => void;
}

export function ClickUpConnectionDetails({
  storeId,
  storeName,
  onDisconnect,
}: ClickUpConnectionDetailsProps) {
  const [connectionData, setConnectionData] = useState<ClickUpConnectionData | null>(null);
  const [storeProducts, setStoreProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedLists, setExpandedLists] = useState<Set<string>>(new Set());
  const [updatingList, setUpdatingList] = useState<string | null>(null);
  const [showAddList, setShowAddList] = useState(false);

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      // Fetch ClickUp connection status with list mappings
      const connRes = await fetch(`/api/integrations/clickup/list-mappings?storeId=${encodeURIComponent(storeId)}`);
      if (!connRes.ok) throw new Error('Failed to fetch ClickUp data');
      
      let data: { 
        connected: boolean; 
        workspaceName?: string; 
        workspaceId?: string; 
        lists?: ClickUpList[]; 
        readyStatus?: string;
        storeProducts?: StoreProduct[];
      } = { connected: false };
      
      try {
        const text = await connRes.text();
        if (text) {
          data = JSON.parse(text);
        }
      } catch {
        data = { connected: false };
      }

      if (!data.connected) {
        setError('Not connected');
        setLoading(false);
        return;
      }

      setConnectionData({
        connected: true,
        workspaceName: data.workspaceName,
        workspaceId: data.workspaceId,
        lists: data.lists || [],
        readyStatus: data.readyStatus,
      });
      setStoreProducts(data.storeProducts || []);

      // Auto-expand all lists on first load
      if (data.lists?.length) {
        setExpandedLists(new Set(data.lists.map((l) => l.id)));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  // Filter lists based on search
  const filteredLists = useMemo(() => {
    if (!connectionData?.lists) return [];
    if (!search.trim()) return connectionData.lists;
    const q = search.toLowerCase();
    return connectionData.lists.filter(
      (l) => l.name.toLowerCase().includes(q) || l.assignedProductName?.toLowerCase().includes(q)
    );
  }, [connectionData?.lists, search]);

  const assignedCount = connectionData?.lists.filter((l) => l.assignedProductId).length || 0;

  async function handleAssignProduct(listId: string, productId: string | null, productName: string | null) {
    setUpdatingList(listId);
    try {
      const res = await fetch('/api/integrations/clickup/list-mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, listId, productId, productName }),
      });
      if (!res.ok) throw new Error('Failed to update');

      setConnectionData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          lists: prev.lists.map((l) =>
            l.id === listId
              ? { ...l, assignedProductId: productId || undefined, assignedProductName: productName || undefined }
              : l
          ),
        };
      });
      toast.success(productId ? 'Product assigned to list' : 'Product unassigned');
    } catch {
      toast.error('Failed to update assignment');
    } finally {
      setUpdatingList(null);
    }
  }

  async function handleRemoveList(listId: string) {
    setUpdatingList(listId);
    try {
      const res = await fetch('/api/integrations/clickup/list-mappings', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, listId }),
      });
      if (!res.ok) throw new Error('Failed to remove');

      setConnectionData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          lists: prev.lists.filter((l) => l.id !== listId),
        };
      });
      toast.success('List removed');
    } catch {
      toast.error('Failed to remove list');
    } finally {
      setUpdatingList(null);
    }
  }

  function toggleListExpansion(listId: string) {
    setExpandedLists((prev) => {
      const next = new Set(prev);
      if (next.has(listId)) {
        next.delete(listId);
      } else {
        next.add(listId);
      }
      return next;
    });
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-purple-500" />
          <span className="text-sm text-gray-500">Loading ClickUp connection details...</span>
        </div>
      </div>
    );
  }

  if (error || !connectionData) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-3 text-gray-400">
          <AlertCircle className="h-5 w-5" />
          <span className="text-sm">{error || 'No connection data'}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-50"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50">
            <CheckSquare className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">ClickUp Connection</h3>
            <div className="flex items-center gap-2 mt-0.5">
              {connectionData.workspaceName && (
                <span className="text-xs text-gray-500">
                  {connectionData.workspaceName}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-medium text-purple-700">
            {connectionData.lists.length} list{connectionData.lists.length !== 1 ? 's' : ''}
          </span>
          {assignedCount > 0 && (
            <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
              {assignedCount} assigned
            </span>
          )}
          <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
            Connected
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              fetchData();
            }}
            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            title="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100">
          {/* Ready Status Info */}
          {connectionData.readyStatus && (
            <div className="flex items-center gap-3 px-5 py-3 bg-gray-50/50 border-b border-gray-100">
              <CheckSquare className="h-4 w-4 text-gray-400" />
              <div>
                <span className="text-xs font-medium text-gray-700">Ready Status: </span>
                <span className="text-xs text-gray-600 capitalize">{connectionData.readyStatus}</span>
              </div>
            </div>
          )}

          {/* Search & Add List Bar */}
          <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search lists..."
                className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>
            <button
              onClick={() => setShowAddList(true)}
              className="flex items-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-xs font-medium text-white hover:bg-purple-700 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Add List
            </button>
          </div>

          {/* Lists */}
          <div className="max-h-[500px] overflow-y-auto">
            {filteredLists.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <List className="mx-auto h-8 w-8 text-gray-300" />
                <p className="mt-2 text-sm text-gray-500">
                  {search ? 'No lists match your search.' : 'No lists configured. Click "Add List" to add ClickUp lists.'}
                </p>
              </div>
            ) : (
              filteredLists.map((list) => {
                const isExpanded = expandedLists.has(list.id);
                const isAssigned = !!list.assignedProductId;
                const isUpdating = updatingList === list.id;

                return (
                  <div key={list.id} className="border-b border-gray-100 last:border-b-0">
                    {/* List Header */}
                    <div
                      className={cn(
                        'flex items-center justify-between px-5 py-3 transition-colors',
                        isAssigned ? 'bg-purple-50/30' : 'hover:bg-gray-50'
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <button
                          onClick={() => toggleListExpansion(list.id)}
                          className="flex-shrink-0"
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-gray-400" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-gray-400" />
                          )}
                        </button>
                        <div className="h-10 w-10 flex-shrink-0 rounded-lg bg-purple-100 flex items-center justify-center">
                          <List className="h-5 w-5 text-purple-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{list.name}</p>
                          {isAssigned ? (
                            <p className="text-xs text-green-600 truncate flex items-center gap-1">
                              <Package className="h-3 w-3" />
                              {list.assignedProductName}
                            </p>
                          ) : (
                            <p className="text-xs text-gray-400">No product assigned</p>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                        {isAssigned && (
                          <button
                            onClick={() => handleAssignProduct(list.id, null, null)}
                            disabled={isUpdating}
                            className={cn(
                              'flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors',
                              isUpdating && 'opacity-50 cursor-wait',
                              'text-gray-500 hover:bg-gray-100'
                            )}
                            title="Unassign product"
                          >
                            {isUpdating ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Unlink className="h-3 w-3" />
                            )}
                          </button>
                        )}
                        <button
                          onClick={() => handleRemoveList(list.id)}
                          disabled={isUpdating}
                          className={cn(
                            'flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors',
                            isUpdating && 'opacity-50 cursor-wait',
                            'text-red-500 hover:bg-red-50'
                          )}
                          title="Remove list"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>

                    {/* Expanded: Show product dropdown */}
                    {isExpanded && (
                      <div className="bg-gray-50/50 px-5 py-3 pl-14">
                        <label className="text-xs font-medium text-gray-500 mb-2 block">
                          Assign a store product to this list:
                        </label>
                        {storeProducts.length === 0 ? (
                          <p className="text-xs text-gray-400">
                            No products found. Add products in P&L Settings first.
                          </p>
                        ) : (
                          <select
                            value={list.assignedProductId || ''}
                            onChange={(e) => {
                              const productId = e.target.value;
                              const product = storeProducts.find((p) => p.id === productId);
                              handleAssignProduct(list.id, productId || null, product?.name || null);
                            }}
                            disabled={isUpdating}
                            className={cn(
                              'w-full max-w-md rounded-lg border bg-white px-3 py-2 text-sm text-gray-900 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500',
                              isUpdating && 'opacity-50 cursor-wait'
                            )}
                          >
                            <option value="">-- Select a product --</option>
                            {storeProducts.map((product) => (
                              <option key={product.id} value={product.id}>
                                {product.name}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Actions */}
          <div className="border-t border-gray-100 px-5 py-3 bg-gray-50/50 flex items-center justify-between">
            <button
              onClick={onDisconnect}
              className="flex items-center gap-2 text-xs text-red-600 hover:text-red-700 transition-colors"
            >
              <Unlink className="h-3.5 w-3.5" />
              Disconnect ClickUp
            </button>
            <button
              onClick={() => setShowAddList(true)}
              className="flex items-center gap-2 text-xs text-purple-600 hover:text-purple-700 transition-colors"
            >
              <Settings className="h-3.5 w-3.5" />
              Manage Lists
            </button>
          </div>
        </div>
      )}

      {/* Add List Modal */}
      {showAddList && (
        <AddListModal
          storeId={storeId}
          onClose={() => setShowAddList(false)}
          onListAdded={() => {
            setShowAddList(false);
            fetchData();
          }}
        />
      )}
    </div>
  );
}

// Add List Modal Component
function AddListModal({
  storeId,
  onClose,
  onListAdded,
}: {
  storeId: string;
  onClose: () => void;
  onListAdded: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<string | null>(null);
  const [spaces, setSpaces] = useState<Array<{
    id: string;
    name: string;
    folders: Array<{
      id: string;
      name: string;
      lists: Array<{ id: string; name: string; isAdded: boolean }>;
    }>;
    lists: Array<{ id: string; name: string; isAdded: boolean }>;
  }>>([]);
  const [expandedSpaces, setExpandedSpaces] = useState<Set<string>>(new Set());
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchLists() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/integrations/clickup/available-lists?storeId=${encodeURIComponent(storeId)}`);
        if (!res.ok) throw new Error('Failed to fetch lists');
        
        const text = await res.text();
        const data = text ? JSON.parse(text) : { spaces: [] };
        setSpaces(data.spaces || []);
        // Expand all spaces by default
        if (data.spaces?.length) {
          setExpandedSpaces(new Set(data.spaces.map((s: { id: string }) => s.id)));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load lists');
      } finally {
        setLoading(false);
      }
    }
    fetchLists();
  }, [storeId]);

  // Filter spaces/folders/lists based on search
  const filteredSpaces = useMemo(() => {
    if (!search.trim()) return spaces;
    const q = search.toLowerCase();
    
    return spaces.map(space => {
      // Filter folderless lists
      const filteredLists = space.lists.filter(l => l.name.toLowerCase().includes(q));
      
      // Filter folders and their lists
      const filteredFolders = space.folders.map(folder => ({
        ...folder,
        lists: folder.lists.filter(l => 
          l.name.toLowerCase().includes(q) || folder.name.toLowerCase().includes(q)
        ),
      })).filter(folder => folder.lists.length > 0 || folder.name.toLowerCase().includes(q));
      
      return {
        ...space,
        lists: filteredLists,
        folders: filteredFolders,
      };
    }).filter(space => 
      space.lists.length > 0 || 
      space.folders.length > 0 || 
      space.name.toLowerCase().includes(q)
    );
  }, [spaces, search]);

  async function handleAddList(listId: string, listName: string) {
    setAdding(listId);
    try {
      const res = await fetch('/api/integrations/clickup/add-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, listId, listName }),
      });
      if (!res.ok) throw new Error('Failed to add list');

      // Update local state
      setSpaces((prev) =>
        prev.map((space) => ({
          ...space,
          lists: space.lists.map((l) => (l.id === listId ? { ...l, isAdded: true } : l)),
          folders: space.folders.map((folder) => ({
            ...folder,
            lists: folder.lists.map((l) => (l.id === listId ? { ...l, isAdded: true } : l)),
          })),
        }))
      );
      toast.success(`Added "${listName}"`);
      onListAdded();
    } catch {
      toast.error('Failed to add list');
    } finally {
      setAdding(null);
    }
  }

  function toggleSpace(spaceId: string) {
    setExpandedSpaces(prev => {
      const next = new Set(prev);
      if (next.has(spaceId)) next.delete(spaceId);
      else next.add(spaceId);
      return next;
    });
  }

  function toggleFolder(folderId: string) {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-lg w-full max-w-lg mx-4 max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">Add ClickUp Lists</h3>
          <p className="text-sm text-gray-500 mt-1">
            Select lists from your workspace to add to this store.
          </p>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-gray-100">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search lists..."
              className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-purple-500" />
              <p className="mt-3 text-sm text-gray-500">Loading lists from ClickUp...</p>
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <AlertCircle className="mx-auto h-8 w-8 text-red-400" />
              <p className="mt-2 text-sm text-red-600">{error}</p>
            </div>
          ) : filteredSpaces.length === 0 ? (
            <div className="text-center py-8">
              <List className="mx-auto h-8 w-8 text-gray-300" />
              <p className="mt-2 text-sm text-gray-500">
                {search ? 'No lists match your search.' : 'No lists found in your workspace.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredSpaces.map((space) => {
                const isSpaceExpanded = expandedSpaces.has(space.id);
                const totalLists = space.lists.length + space.folders.reduce((sum, f) => sum + f.lists.length, 0);
                
                return (
                  <div key={space.id} className="border border-gray-200 rounded-lg overflow-hidden">
                    {/* Space Header */}
                    <button
                      onClick={() => toggleSpace(space.id)}
                      className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        {isSpaceExpanded ? (
                          <ChevronDown className="h-4 w-4 text-gray-500" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-gray-500" />
                        )}
                        <span className="text-sm font-semibold text-gray-700">{space.name}</span>
                        <span className="text-xs text-gray-400">({totalLists} lists)</span>
                      </div>
                    </button>
                    
                    {/* Space Content */}
                    {isSpaceExpanded && (
                      <div className="px-4 py-2 space-y-2">
                        {/* Folderless Lists */}
                        {space.lists.map((list) => (
                          <ListRow
                            key={list.id}
                            list={list}
                            adding={adding}
                            onAdd={handleAddList}
                          />
                        ))}
                        
                        {/* Folders */}
                        {space.folders.map((folder) => {
                          const isFolderExpanded = expandedFolders.has(folder.id);
                          
                          return (
                            <div key={folder.id} className="border border-gray-100 rounded-lg overflow-hidden">
                              {/* Folder Header */}
                              <button
                                onClick={() => toggleFolder(folder.id)}
                                className="w-full flex items-center justify-between px-3 py-2 bg-gray-50/50 hover:bg-gray-100/50 transition-colors"
                              >
                                <div className="flex items-center gap-2">
                                  {isFolderExpanded ? (
                                    <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                                  ) : (
                                    <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                                  )}
                                  <span className="text-xs font-medium text-gray-600">📁 {folder.name}</span>
                                  <span className="text-xs text-gray-400">({folder.lists.length})</span>
                                </div>
                              </button>
                              
                              {/* Folder Lists */}
                              {isFolderExpanded && (
                                <div className="px-3 py-2 space-y-1.5 bg-white">
                                  {folder.lists.map((list) => (
                                    <ListRow
                                      key={list.id}
                                      list={list}
                                      adding={adding}
                                      onAdd={handleAddList}
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// List row component for the modal
function ListRow({
  list,
  adding,
  onAdd,
}: {
  list: { id: string; name: string; isAdded: boolean };
  adding: string | null;
  onAdd: (id: string, name: string) => void;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between rounded-lg border p-2.5 transition-colors',
        list.isAdded
          ? 'border-green-200 bg-green-50'
          : 'border-gray-200 hover:border-purple-200 hover:bg-purple-50/30'
      )}
    >
      <p className="text-sm font-medium text-gray-900 truncate">{list.name}</p>
      {list.isAdded ? (
        <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
          <Check className="h-3.5 w-3.5" />
          Added
        </span>
      ) : (
        <button
          onClick={() => onAdd(list.id, list.name)}
          disabled={adding === list.id}
          className="flex items-center gap-1.5 rounded-md bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-50 transition-colors"
        >
          {adding === list.id ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Plus className="h-3 w-3" />
          )}
          Add
        </button>
      )}
    </div>
  );
}
