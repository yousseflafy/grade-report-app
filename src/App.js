import React, { useState } from "react";
import * as XLSX from "xlsx";
import Plot from "react-plotly.js";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export default function App() {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState("");
  const [passing, setPassing] = useState(40);
  const [distinction, setDistinction] = useState(70);
  const [gradeColumn, setGradeColumn] = useState("");
  const [groupColumn, setGroupColumn] = useState("");
  const [columns, setColumns] = useState([]);
  const [data, setData] = useState([]);
  const [overallSummary, setOverallSummary] = useState([]);
  const [groupSummary, setGroupSummary] = useState([]);
  const [reportGenerated, setReportGenerated] = useState(false);

  const resetAll = () => {
    setFile(null);
    setTitle("");
    setPassing(40);
    setDistinction(70);
    setGradeColumn("");
    setGroupColumn("");
    setColumns([]);
    setData([]);
    setOverallSummary([]);
    setGroupSummary([]);
    setReportGenerated(false);
  };

  const handleFileUpload = (e) => {
    const uploadedFile = e.target.files[0];
    if (!uploadedFile) return;
    setFile(uploadedFile);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target.result;
      const wb = XLSX.read(bstr, { type: "binary" });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const jsonData = XLSX.utils.sheet_to_json(ws);
      setData(jsonData);
      const detectedCols = Object.keys(jsonData[0] || {});
      setColumns(detectedCols);

      const gradeGuess = detectedCols.find(c =>
        c.toLowerCase().includes("grade") || c.toLowerCase().includes("score")
      );
      const groupGuess = detectedCols.find(c =>
        c.toLowerCase().includes("group") || c.toLowerCase().includes("section")
      );

      setGradeColumn(gradeGuess || "");
      setGroupColumn(groupGuess || "");
    };
    reader.readAsBinaryString(uploadedFile);
  };

  const generateReport = () => {
    if (!data.length || !gradeColumn || !groupColumn) return;

    const grades = data.map(row => Number(row[gradeColumn]) || 0);

    const overall = [{
      N: grades.length,
      "Passing Rate (%)": ((grades.filter(g => g >= passing).length) / grades.length * 100).toFixed(1),
      Mean: (grades.reduce((a,b) => a + b, 0) / grades.length).toFixed(2),
      SD: (Math.sqrt(grades.reduce((a,b) => a + Math.pow(b - (grades.reduce((x,y)=>x+y,0)/grades.length),2), 0) / grades.length)).toFixed(2),
      Max: Math.max(...grades),
      Min: Math.min(...grades),
      "Distinction Rate (%)": ((grades.filter(g => g >= distinction).length) / grades.length * 100).toFixed(1)
    }];
    setOverallSummary(overall);

    const groupStats = {};
    data.forEach(row => {
      const grp = row[groupColumn];
      if (!groupStats[grp]) groupStats[grp] = [];
      groupStats[grp].push(Number(row[gradeColumn]) || 0);
    });
    const groupArr = Object.keys(groupStats).map(grp => {
      const g = groupStats[grp];
      return {
        Group: grp,
        N: g.length,
        "Passing Rate (%)": ((g.filter(x => x >= passing).length) / g.length * 100).toFixed(1),
        Mean: (g.reduce((a,b) => a + b, 0) / g.length).toFixed(2),
        SD: (Math.sqrt(g.reduce((a,b) => a + Math.pow(b - (g.reduce((x,y)=>x+y,0)/g.length),2), 0) / g.length)).toFixed(2),
        Max: Math.max(...g),
        Min: Math.min(...g),
        "Distinction Rate (%)": ((g.filter(x => x >= distinction).length) / g.length * 100).toFixed(1)
      };
    });
    setGroupSummary(groupArr);
    setReportGenerated(true);
  };

  const downloadPDF = () => {
    if (!reportGenerated) return;

    const doc = new jsPDF();
    doc.setFont("Times", "normal");
    doc.setFontSize(14);
    doc.text(title || "Mid-Term Politics Grades Report", 14, 20);
    doc.setFontSize(11);
    doc.text("Prepared by: Youssef Lafy", 14, 30);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, 37);
    doc.addPage();
    autoTable(doc, { head: [Object.keys(overallSummary[0])], body: overallSummary.map(o => Object.values(o)), startY: 20, theme: "grid" });
    doc.addPage();
    autoTable(doc, { head: [Object.keys(groupSummary[0])], body: groupSummary.map(o => Object.values(o)), startY: 20, theme: "grid" });
    doc.save("Grade_Report.pdf");
  };

  return (
    <div>
      <h1>Grade Report Generator</h1>
      <input type="file" accept=".csv,.xlsx" onChange={handleFileUpload} />
      <br />
      <input type="text" placeholder="Report Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <br />
      <label>Passing Threshold: </label>
      <input type="number" value={passing} onChange={(e) => setPassing(Number(e.target.value))} />
      <label> Distinction Threshold: </label>
      <input type="number" value={distinction} onChange={(e) => setDistinction(Number(e.target.value))} />
      <br />
      {columns.length > 0 && (
        <>
          <label>Grade Column:</label>
          <select value={gradeColumn} onChange={(e) => setGradeColumn(e.target.value)}>
            <option value="">Select</option>
            {columns.map(col => <option key={col} value={col}>{col}</option>)}
          </select>
          <label> Group Column:</label>
          <select value={groupColumn} onChange={(e) => setGroupColumn(e.target.value)}>
            <option value="">Select</option>
            {columns.map(col => <option key={col} value={col}>{col}</option>)}
          </select>
        </>
      )}
      <br />
      <button onClick={generateReport}>Generate Report</button>
      <button onClick={downloadPDF} disabled={!reportGenerated}>Download PDF</button>
      <button onClick={resetAll}>Reset</button>

      {reportGenerated && (
        <>
          <h2>Overall Summary</h2>
          <pre>{JSON.stringify(overallSummary, null, 2)}</pre>
          <h2>Group Summary</h2>
          <pre>{JSON.stringify(groupSummary, null, 2)}</pre>

          <h2>Grade Distribution</h2>
          <Plot
            data={[{
              x: data.map(row => row[gradeColumn]),
              type: "histogram"
            }]}
            layout={{ title: "Grade Distribution" }}
          />

          <h2>Boxplot by Group</h2>
          <Plot
            data={[{
              y: data.map(row => row[gradeColumn]),
              x: data.map(row => row[groupColumn]),
              type: "box"
            }]}
            layout={{ title: "Grades by Group" }}
          />
        </>
      )}
    </div>
  );
}
