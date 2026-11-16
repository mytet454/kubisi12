/**
 * src/utils/csvExport.ts
 * CSV export utility with UTF-8 BOM so Excel opens Arabic text cleanly.
 */

export function exportToCSV(filename: string, headers: string[], rows: (string | number)[][]): void {
  // Add UTF-8 BOM to ensure Arabic is rendered properly in Excel
  const BOM = '\uFEFF';
  const csvContent =
    BOM +
    [
      headers.map(h => `"${String(h).replace(/"/g, '""')}"`).join(','),
      ...rows.map(row =>
        row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')
      ),
    ].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
