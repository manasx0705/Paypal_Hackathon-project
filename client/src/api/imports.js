import { api, data } from './client';
export const downloadTemplate = async (type) => {
  const r = await api.get(`/import/templates/${type}`, { responseType: 'blob' });
  const url = URL.createObjectURL(new Blob([r.data], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${type}-template.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
export const dryRun = (type, file) => {
  const fd = new FormData();
  fd.append('file', file);
  return data(api.post(`/import/${type}/dry-run`, fd));
};
export const commitImport = (importId) => data(api.post(`/import/${importId}/commit`));
export const getDataQuality = () => data(api.get('/data-quality'));
