import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, FileDown, Loader2 } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun } from 'docx';
import { fetchAnalyses, type AnalysisWithImage } from '../lib/api';

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function DocsPage() {
  const [loading, setLoading] = useState<'pdf' | 'docx' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAndDownloadPDF = async () => {
    setLoading('pdf');
    setError(null);
    try {
      const data = await fetchAnalyses(500);
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      doc.setFontSize(14);
      doc.text('Rice Plant Health – Analysis Report', 14, 15);
      doc.setFontSize(10);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 22);

      const headers = ['Date', 'Status', 'Score', 'Green %', 'Yellow %', 'Brown %', 'Harvest', 'Recommendations'];
      const rows = data.map((a) => [
        new Date(a.analyzed_at).toLocaleString(),
        a.health_status ?? '',
        String(a.health_score ?? ''),
        String(a.green_percentage ?? ''),
        String(a.yellow_percentage ?? ''),
        String(a.brown_percentage ?? ''),
        a.harvest_ready ? 'Yes' : 'No',
        (a.recommendations ?? '').slice(0, 60) + ((a.recommendations?.length ?? 0) > 60 ? '…' : ''),
      ]);

      autoTable(doc, {
        head: [headers],
        body: rows,
        startY: 28,
        theme: 'grid',
        styles: { fontSize: 8 },
        headStyles: { fillColor: [34, 197, 94] },
      });

      const date = new Date().toISOString().slice(0, 10);
      doc.save(`rice-analysis-${date}.pdf`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate PDF');
    } finally {
      setLoading(null);
    }
  };

  const loadAndDownloadWord = async () => {
    setLoading('docx');
    setError(null);
    try {
      const data = await fetchAnalyses(500);
      const date = new Date().toISOString().slice(0, 10);

      const headerRow = new TableRow({
        children: [
          new TableCell({ children: [new Paragraph('Date')] }),
          new TableCell({ children: [new Paragraph('Status')] }),
          new TableCell({ children: [new Paragraph('Score')] }),
          new TableCell({ children: [new Paragraph('Green %')] }),
          new TableCell({ children: [new Paragraph('Yellow %')] }),
          new TableCell({ children: [new Paragraph('Brown %')] }),
          new TableCell({ children: [new Paragraph('Harvest')] }),
          new TableCell({ children: [new Paragraph('Recommendations')] }),
        ],
        tableHeader: true,
      });

      const bodyRows = data.map(
        (a) =>
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph(new Date(a.analyzed_at).toLocaleString())] }),
              new TableCell({ children: [new Paragraph(a.health_status ?? '')] }),
              new TableCell({ children: [new Paragraph(String(a.health_score ?? ''))] }),
              new TableCell({ children: [new Paragraph(String(a.green_percentage ?? ''))] }),
              new TableCell({ children: [new Paragraph(String(a.yellow_percentage ?? ''))] }),
              new TableCell({ children: [new Paragraph(String(a.brown_percentage ?? ''))] }),
              new TableCell({ children: [new Paragraph(a.harvest_ready ? 'Yes' : 'No')] }),
              new TableCell({ children: [new Paragraph((a.recommendations ?? '').slice(0, 200))] }),
            ],
          })
      );

      const table = new Table({
        width: { size: 100, type: 'PERCENTAGE' },
        rows: [headerRow, ...bodyRows],
      });

      const doc = new Document({
        sections: [
          {
            children: [
              new Paragraph({
                children: [new TextRun({ text: 'Rice Plant Health – Analysis Report', bold: true, size: 28 })],
              }),
              new Paragraph({
                children: [new TextRun({ text: `Generated: ${new Date().toLocaleString()}`, size: 22 })],
              }),
              new Paragraph({ text: '' }),
              table,
            ],
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      downloadBlob(blob, `rice-analysis-${date}.docx`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate Word document');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="rounded-2xl border border-emerald-200 bg-white/80 p-6 shadow-sm">
        <h1 className="mb-2 text-2xl font-bold text-emerald-800">Docs</h1>
        <p className="mb-6 text-emerald-700">
          Download your analysis results as a report. Choose Word (.docx) for editing and sharing, or PDF for
          printing and archiving. Data includes health score, color percentages, harvest readiness, and
          recommendations for each captured image.
        </p>
        {error && (
          <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-4">
          <button
            onClick={loadAndDownloadPDF}
            disabled={!!loading}
            className="inline-flex items-center gap-2 rounded-xl border-2 border-emerald-400 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-60"
          >
            {loading === 'pdf' ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <FileText className="h-5 w-5" />
            )}
            Download as PDF
          </button>
          <button
            onClick={loadAndDownloadWord}
            disabled={!!loading}
            className="inline-flex items-center gap-2 rounded-xl border-2 border-emerald-400 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-60"
          >
            {loading === 'docx' ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <FileDown className="h-5 w-5" />
            )}
            Download as Word
          </button>
        </div>
        <p className="mt-4 text-xs text-emerald-600">Exports up to 500 most recent analyses.</p>
        <div className="mt-8">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-500"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
