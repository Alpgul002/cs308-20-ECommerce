import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import { HttpError } from "./errors.js";

const FONT = fileURLToPath(new URL("../assets/NotoSans-Regular.ttf", import.meta.url));
const MARGIN = 48;
const INK = "#20223a";
const MUTED = "#555b72";
const RULE = "#dfe2ec";

function singleLine(value) {
  return value?.replace(/\s+/gu, " ").trim() || "Not recorded";
}

// Takes the same purchase snapshot as the JSON invoice. The buffer can also be sent as an attachment.
export async function renderInvoicePdf(invoice) {
  const itemsTotal = invoice.items.reduce((sum, item) => sum + item.lineTotalCents, 0);
  if (itemsTotal !== invoice.totalCents || invoice.payment.amountCents !== invoice.totalCents) {
    throw new HttpError(409, "Invoice totals do not match the recorded payment.");
  }

  const issued = new Date(invoice.issuedAt);
  const doc = new PDFDocument({
    size: "A4",
    margin: MARGIN,
    font: FONT,
    info: { Title: invoice.number, Author: "Orbit Store", CreationDate: issued }
  });
  const right = doc.page.width - MARGIN;
  const contentWidth = right - MARGIN;
  const money = new Intl.NumberFormat("en-US", {
    style: "currency", currency: invoice.currency, currencyDisplay: "code",
    minimumFractionDigits: 2, maximumFractionDigits: 2
  });
  const amount = (cents) => money.format(cents / 100);
  const date = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(issued);

  const columns = [
    { title: "Product", x: MARGIN, width: contentWidth - 254, align: "left" },
    { title: "Qty", x: right - 242, width: 26, align: "right" },
    { title: "Unit price", x: right - 204, width: 94, align: "right" },
    { title: "Line total", x: right - 98, width: 98, align: "right" }
  ];
  const nameWidth = columns[0].width;
  let y = MARGIN;

  function divider(at) {
    doc.strokeColor(RULE).lineWidth(0.6).moveTo(MARGIN, at).lineTo(right, at).stroke();
  }

  function tableHeader() {
    doc.rect(MARGIN, y, contentWidth, 26).fill("#edf0f8");
    doc.fillColor(INK).fontSize(9);
    for (const { title, x, width, align } of columns) {
      doc.text(title, x, y + 7, { width, align });
    }
    y += 26;
  }

  function nextPage() {
    doc.addPage();
    doc.fillColor(MUTED).fontSize(11).text(`Invoice ${invoice.number}`, MARGIN, MARGIN);
    y = doc.y + 16;
    tableHeader();
  }

  doc.fillColor("#4032aa").fontSize(12).text("ORBIT STORE", MARGIN, y);
  doc.fillColor(INK).fontSize(32).text("Invoice", MARGIN, doc.y + 4);
  doc.fillColor(MUTED).fontSize(11).text(`${invoice.number}  •  Order #${invoice.orderId}  •  ${date}`);
  divider(doc.y + 12);

  const customerTop = doc.y + 24;
  doc.fontSize(9).fillColor(MUTED).text("CUSTOMER AND DELIVERY ADDRESS", MARGIN, customerTop);
  doc.fontSize(11).fillColor(INK).text(singleLine(invoice.customer.name), MARGIN, doc.y + 5);
  doc.fillColor(MUTED).text(singleLine(invoice.deliveryAddress));
  y = doc.y + 23;
  tableHeader();

  for (const item of invoice.items) {
    const name = singleLine(item.name);
    doc.fontSize(10);
    const rowHeight = Math.max(32, doc.heightOfString(name, { width: nameWidth }) + 16);
    if (y + rowHeight > doc.page.height - MARGIN) nextPage();
    doc.fillColor(INK).fontSize(10);
    const values = [name, String(item.quantity), amount(item.unitPriceCents), amount(item.lineTotalCents)];
    columns.forEach(({ x, width, align }, index) => {
      doc.text(values[index], x, y + 8, { width, align });
    });
    y += rowHeight;
    divider(y);
  }

  if (y + 58 > doc.page.height - MARGIN) {
    doc.addPage();
    doc.fillColor(MUTED).fontSize(11).text(`Invoice ${invoice.number}`, MARGIN, MARGIN);
    y = doc.y + 16;
  }
  doc.rect(MARGIN, y + 12, contentWidth, 42).fill("#edf0f8");
  doc.fillColor(INK).fontSize(13).text("Total paid", MARGIN + 12, y + 24);
  doc.text(amount(invoice.totalCents), MARGIN, y + 24, { width: contentWidth - 12, align: "right" });

  doc.end();
  const chunks = [];
  for await (const chunk of doc) chunks.push(chunk);
  return Buffer.concat(chunks);
}
