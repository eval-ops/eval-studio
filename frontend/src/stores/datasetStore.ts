import { create } from 'zustand';
import type {
  Dataset,
  DatasetDetail,
  DatasetItem,
  DatasetItemCreate,
  DatasetItemUpdate,
  CreateDatasetRequest,
  DatasetVersion,
  DatasetVersionDetail,
  AnalyzeResponse,
  ImportRequest,
} from '@/types';
import { api } from '@/services/api';

interface DatasetStore {
  datasets: Dataset[];
  currentDataset: DatasetDetail | null;
  isLoading: boolean;
  error: string | null;

  // Version history state
  versions: DatasetVersion[];
  selectedVersion: DatasetVersionDetail | null;
  viewingVersionId: string | null;
  isLoadingVersions: boolean;

  // Smart import state
  analysisResult: AnalyzeResponse | null;
  isAnalyzing: boolean;
  isImporting: boolean;

  setDatasets: (datasets: Dataset[]) => void;
  setCurrentDataset: (dataset: DatasetDetail | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;

  fetchDatasets: () => Promise<void>;
  fetchDataset: (id: string) => Promise<void>;
  uploadDataset: (data: CreateDatasetRequest) => Promise<Dataset>;
  updateDataset: (id: string, data: Partial<CreateDatasetRequest>) => Promise<Dataset>;
  removeDataset: (id: string) => Promise<void>;

  // Item CRUD actions
  addItems: (datasetId: string, items: DatasetItemCreate[]) => Promise<DatasetItem[]>;
  updateItem: (datasetId: string, itemId: string, data: DatasetItemUpdate) => Promise<DatasetItem>;
  deleteItem: (datasetId: string, itemId: string) => Promise<void>;

  // Version history actions
  fetchVersions: (datasetId: string) => Promise<void>;
  fetchVersionItems: (datasetId: string, versionId: string) => Promise<void>;
  clearVersionView: () => void;

  // Smart import actions
  analyzeFiles: (files: File[]) => Promise<void>;
  smartImport: (data: ImportRequest) => Promise<Dataset>;
  clearAnalysis: () => void;
}

export const useDatasetStore = create<DatasetStore>((set, get) => ({
  datasets: [],
  currentDataset: null,
  isLoading: false,
  error: null,

  // Version history initial state
  versions: [],
  selectedVersion: null,
  viewingVersionId: null,
  isLoadingVersions: false,

  // Smart import initial state
  analysisResult: null,
  isAnalyzing: false,
  isImporting: false,

  setDatasets: (datasets) => set({ datasets }),
  setCurrentDataset: (currentDataset) => set({ currentDataset }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  clearError: () => set({ error: null }),

  fetchDatasets: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.listDatasets();
      set({ datasets: response.items, isLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch datasets';
      set({ error: message, isLoading: false });
    }
  },

  fetchDataset: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const detail = await api.getDataset(id);
      set({ currentDataset: detail, isLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch dataset';
      set({ error: message, isLoading: false });
    }
  },

  uploadDataset: async (data: CreateDatasetRequest) => {
    try {
      const dataset = await api.createDataset(data);
      set({ datasets: [dataset, ...get().datasets] });
      return dataset;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to upload dataset';
      set({ error: message });
      throw err;
    }
  },

  updateDataset: async (id: string, data: Partial<CreateDatasetRequest>) => {
    set({ error: null });
    try {
      const updated = await api.updateDataset(id, data);
      set((state) => ({
        datasets: state.datasets.map((d) => (d.id === id ? updated : d)),
      }));
      return updated;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update dataset';
      set({ error: message });
      throw err;
    }
  },

  removeDataset: async (id: string) => {
    try {
      await api.deleteDataset(id);
      const { currentDataset } = get();
      set({
        datasets: get().datasets.filter((d) => d.id !== id),
        currentDataset: currentDataset?.id === id ? null : currentDataset,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete dataset';
      set({ error: message });
      throw err;
    }
  },

  addItems: async (datasetId: string, items: DatasetItemCreate[]) => {
    try {
      const newItems = await api.addDatasetItems(datasetId, items);
      const { currentDataset } = get();
      if (currentDataset?.id === datasetId) {
        await get().fetchDataset(datasetId);
      }
      return newItems;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add items';
      set({ error: message });
      throw err;
    }
  },

  updateItem: async (datasetId: string, itemId: string, data: DatasetItemUpdate) => {
    try {
      const updated = await api.updateDatasetItem(datasetId, itemId, data);
      const { currentDataset } = get();
      if (currentDataset?.id === datasetId) {
        await get().fetchDataset(datasetId);
      }
      return updated;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update item';
      set({ error: message });
      throw err;
    }
  },

  deleteItem: async (datasetId: string, itemId: string) => {
    try {
      await api.deleteDatasetItem(datasetId, itemId);
      const { currentDataset } = get();
      if (currentDataset?.id === datasetId) {
        await get().fetchDataset(datasetId);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete item';
      set({ error: message });
      throw err;
    }
  },

  fetchVersions: async (datasetId: string) => {
    set({ isLoadingVersions: true });
    try {
      const versions = await api.listDatasetVersions(datasetId);
      set({ versions, isLoadingVersions: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch versions';
      set({ error: message, isLoadingVersions: false });
    }
  },

  fetchVersionItems: async (datasetId: string, versionId: string) => {
    set({ isLoadingVersions: true });
    try {
      const versionDetail = await api.getDatasetVersion(datasetId, versionId);
      set({
        selectedVersion: versionDetail,
        viewingVersionId: versionId,
        isLoadingVersions: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch version items';
      set({ error: message, isLoadingVersions: false });
    }
  },

  clearVersionView: () => set({ viewingVersionId: null, selectedVersion: null }),

  analyzeFiles: async (files: File[]) => {
    set({ isAnalyzing: true, error: null });
    try {
      const result = await api.analyzeDatasetFiles(files);
      set({ analysisResult: result, isAnalyzing: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to analyze files';
      set({ error: message, isAnalyzing: false });
      throw err;
    }
  },

  smartImport: async (data: ImportRequest) => {
    set({ isImporting: true, error: null });
    try {
      const dataset = await api.importDataset(data);
      set({
        datasets: [dataset, ...get().datasets],
        analysisResult: null,
        isImporting: false,
      });
      return dataset;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to import dataset';
      set({ error: message, isImporting: false });
      throw err;
    }
  },

  clearAnalysis: () => set({ analysisResult: null, isAnalyzing: false }),
}));
