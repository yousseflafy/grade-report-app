import React, { useState, useRef } from "react";
import * as XLSX from "xlsx";
import Plot from "react-plotly.js";
import jsPDF from "jspdf";
import "jspdf-autotable";

function parseNumber(x) {
  if (x === null || x === undefined) return NaN;
  if (typeof x === "number") return x;
  const s = String(x).trim().replace(/,/g, "").replace(/%/g, "");
  const v = parseFloat(s);
  return Number.isFinite(v) ? v : NaN;
}

export default function App() {
  const fileInputRef = useRef(null);

  const [fileName, setFileName] = useState("");
  const [data, setData] = useState([]);
  const [columns, setColumns] = useState([]);
  const [gradeCol, setGradeCol] = useState("");
  const [groupCol, setGroupCol] = useState("");
  const [title, setTitle] = useState("");
  const [passing, setPassing] = useState(40);
  const [distinction, setDistinction] = useState(70);
  const [overallSummary, setOverallSummary] = useState([]);
  const [groupSummary, setGroupSummary] = useState([]);
  const [reportGenerated, setReportGenerated] = useState(false);

  // File upload -> parse once and store data
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target.result;
      const wb = XLSX.read(bstr, { type: "binary" });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const json = XLSX.utils.sheet_to_json(ws, { defval: null });
      setData(json);

      const cols = Object.keys(json[0] || {});
      setColumns(cols);

      // heuristics
      const gradeCandidate = cols.find((c) =>
        /grade|score|marks?/i.test(c)
      );
      const groupCandidate = cols.find((c) =>
        /group|section|class|cohort/i.test(c)
      );

      setGradeCol(gradeCandidate || cols[0] || "");
      setGroupCol(groupCandidate || cols[1] || "");
      // cleared previous reports when new file loaded
      setOverallSummary([]);
      setGroupSummary([]);
      setReportGenerated(false);
    };
    reader.readAsBinaryString(file);
  };

  // Generate report from stored data
  const generateReport = () => {
    if (!data.length) {
      alert("Please upload a data file first.");
      return;
    }
    if (!gradeCol) {
      alert("Please select a Grade column.");
      return;
    }
    if (!groupCol) {
      alert("Please select a Group column.");
      return;
    }
    if (!title.trim()) {
      const ok = window.confirm("Title is empty. Use default title 'Mid-Term Politics Grades Report'?");
      if (!ok) return;
      setTitle("Mid-Term Politics Grades Report");
    }

    // parse grades robustly
    const rows = data.map((r) => ({
      grade: parseNumber(r[gradeCol]),
      group: r[groupCol] === null || r[groupCol] === undefined ? "(missing)" : String(r[groupCol]),
    })).filter(r => !Number.isNaN(r.grade));

    const N = rows.length;
    if (N === 0) {
      alert("No numeric grades found in selected Grade column.");
      return;
    }

    const passCount = rows.filter(r => r.grade >= passing).length;
    const distCount = rows.filter(r => r.grade >= distinction).length;
    const grades = rows.map(r => r.grade);
    const mean = grades.reduce((a,b) => a+b, 0) / grades.length;
    const sd = Math.sqrt(grades.reduce((a,b) => a + Math.pow(b - mean, 2), 0) / grades.length);

    setOverallSummary([{
      N,
      "Passing Rate (%)": ((passCount / N) * 100).toFixed(1),
      Mean: mean.toFixed(2),
      SD: sd.toFixed(2),
      Max: Math.max(...grades),
      Min: Math.min(...grades),
      "Distinction Rate (%)": ((distCount / N) * 100).toFixed(1),
    }]);

    // group summary
    const groups = {};
    rows.forEach(r => {
      if (!groups[r.group]) groups[r.group] = [];
      groups[r.group].push(r.grade);
    });

    const groupArr = Object.keys(groups).map(g => {
      const arr = groups[g];
      const n = arr.length;
      const pass = arr.filter(x => x >= passing).length;
      const d = arr.filter(x => x >= distinction).length;
      const m = arr.reduce((a,b) => a+b, 0) / n;
      const s = Math.sqrt(arr.reduce((a,b) => a + Math.pow(b - m, 2), 0) / n);
      return {
        Group: g,
        N: n,
        "Passing Rate (%)": ((pass / n) * 100).toFixed(1),
        Mean: m.toFixed(2),
        SD: s.toFixed(2),
        Max: Math.max(...arr),
        Min: Math.min(...arr),
        "Distinction Rate (%)": ((d / n) * 100).toFixed(1),
      };
    });

    setGroupSummary(groupArr);
    setReportGenerated(true);
    // scroll to results
    setTimeout(() => {
      const el = document.getElementById("results");
      if (el) el.scrollIntoView({ behavior: "smooth" });
    }, 200);
  };

  // Download PDF (tables only) with footer
  const downloadPDF = () => {
    const doc = new jsPDF();

    // Title
    doc.setFont("Times", "bold");
    doc.setFontSize(20);
    doc.text("Mid-Term Politics Grades Report", doc.internal.pageSize.width / 2, 15, { align: "center" });

    doc.setFontSize(12);
    doc.setFont("Times", "normal");
    doc.text(`Prepared by: Youssef Lafy`, 14, 25);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, 32);

    let startY = 40;

    // Overall Summary Table
    autoTable(doc, {
      html: "#overallTable",
      startY,
      theme: "grid",
      styles: { font: "Times", fontSize: 11, halign: "center" },
      headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: "bold" }, // blue header
      alternateRowStyles: { fillColor: [245, 245, 245] }, // light gray
    });
  // Save file
    doc.save("grade_report.pdf");
  };
  
  // Group Summary Table
  startY = doc.lastAutoTable.finalY + 10;
  autoTable(doc, {
    html: "#groupTable",
    startY,
    theme: "grid",
    styles: { font: "Times", fontSize: 11, halign: "center" },
    headStyles: { fillColor: [39, 174, 96], textColor: 255, fontStyle: "bold" }, // green header
    alternateRowStyles: { fillColor: [245, 245, 245] },
  });

    // Group summary table (on new page if needed)
    const startY = doc.lastAutoTable.finalY + 20;
    doc.autoTable({
      head: [Object.keys(groupSummary[0])],
      body: groupSummary.map(r => Object.values(r)),
      startY: startY,
      styles: { font: "Times", fontSize: 10 },
      headStyles: { fillColor: [240,240,240] },
    });

    // Footer on every page
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(10);
      doc.setTextColor(120);
      doc.text("Prepared by Youssef Lafy", 40, pageHeight - 30);
    }

    const safeTitle = (title && title.trim()) ? title.replace(/\s+/g, "_") : "Mid-Term_Politics_Grades_Report";
    const filename = `${safeTitle}_${new Date().toISOString().slice(0,10)}.pdf`;
    doc.save(filename);
  };

  const resetAll = () => {
    // clear file input DOM value
    if (fileInputRef.current) fileInputRef.current.value = "";
    // clear states
    setFileName("");
    setData([]);
    setColumns([]);
    setGradeCol("");
    setGroupCol("");
    setTitle("");
    setPassing(40);
    setDistinction(70);
    setOverallSummary([]);
    setGroupSummary([]);
    setReportGenerated(false);
    // scroll to top
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-5xl mx-auto bg-white shadow rounded-lg p-6">
        <h1 className="text-2xl font-semibold mb-4">Grade Report Generator</h1>

        {/* Controls */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="col-span-1 md:col-span-2 space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">Upload CSV / XLSX</label>
              <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFileChange} className="mt-1 block w-full text-sm text-gray-900" />
              {fileName && <div className="text-xs text-gray-500 mt-1">Loaded: {fileName}</div>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-700">Title</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Enter report title" className="mt-1 block w-full border rounded px-2 py-2" />
              </div>

              <div>
                <label className="block text-sm text-gray-700">Grade Column</label>
                <select value={gradeCol} onChange={(e) => setGradeCol(e.target.value)} className="mt-1 block w-full border rounded px-2 py-2">
                  <option value="">-- select --</option>
                  {columns.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-700">Group Column</label>
                <select value={groupCol} onChange={(e) => setGroupCol(e.target.value)} className="mt-1 block w-full border rounded px-2 py-2">
                  <option value="">-- select --</option>
                  {columns.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-700">Passing Threshold</label>
                <input type="number" value={passing} onChange={(e) => setPassing(Number(e.target.value))} className="mt-1 block w-full border rounded px-2 py-2" />
              </div>

              <div>
                <label className="block text-sm text-gray-700">Distinction Threshold</label>
                <input type="number" value={distinction} onChange={(e) => setDistinction(Number(e.target.value))} className="mt-1 block w-full border rounded px-2 py-2" />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 items-stretch">
            <button onClick={generateReport} className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700">Generate Report</button>
            <button onClick={downloadPDF} disabled={!reportGenerated} className={`w-full py-2 rounded ${reportGenerated ? "bg-green-600 text-white hover:bg-green-700" : "bg-gray-300 text-gray-600 cursor-not-allowed"}`}>Download PDF</button>
            <button onClick={resetAll} className="w-full bg-gray-600 text-white py-2 rounded hover:bg-gray-700">Reset</button>
          </div>
        </div>

        {/* Results */}
        <div id="results" className="mt-8">
          {overallSummary.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold">Overall Summary</h2>
              <div className="mt-2 overflow-x-auto">
                <table className="min-w-full table-auto border-collapse">
                  <thead className="bg-gray-50">
                    <tr>
                      {Object.keys(overallSummary[0]).map(k => <th key={k} className="border px-3 py-2 text-left text-sm">{k}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {overallSummary.map((row, i) => (
                      <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                        {Object.values(row).map((v, j) => <td key={j} className="border px-3 py-2 text-sm">{v}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {groupSummary.length > 0 && (
            <div className="mt-6">
              <h2 className="text-xl font-semibold">Group Summary</h2>
              <div className="mt-2 overflow-x-auto">
                <table className="min-w-full table-auto border-collapse">
                  <thead className="bg-gray-50">
                    <tr>
                      {Object.keys(groupSummary[0]).map(k => <th key={k} className="border px-3 py-2 text-left text-sm">{k}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {groupSummary.map((row, i) => (
                      <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                        {Object.values(row).map((v, j) => <td key={j} className="border px-3 py-2 text-sm">{v}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Charts kept in browser only */}
          {reportGenerated && (
            <>
              <div className="mt-8">
                <h3 className="text-lg font-semibold">Grade Distribution</h3>
                <Plot
                  data={[{ x: data.map(r => parseNumber(r[gradeCol])), type: "histogram" }]}
                  layout={{ autosize: true, title: "Grade Distribution" }}
                  style={{ width: "100%", height: "360px" }}
                />
              </div>

              <div className="mt-6">
                <h3 className="text-lg font-semibold">Boxplot by Group</h3>
                <Plot
                  data={
                    Object.entries(data.reduce((acc, row) => {
                      const g = row[groupCol] ?? "(missing)";
                      if (!acc[g]) acc[g] = [];
                      const val = parseNumber(row[gradeCol]);
                      if (!Number.isNaN(val)) acc[g].push(val);
                      return acc;
                    }, {})).map(([grp, arr]) => ({ y: arr, type: "box", name: String(grp) }))
                  }
                  layout={{ autosize: true, title: "Boxplot by Group" }}
                  style={{ width: "100%", height: "360px" }}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
