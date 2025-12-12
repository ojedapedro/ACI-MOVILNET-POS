/**
 * GOOGLE APPS SCRIPT BACKEND CODE
 * Copy this entire content into Code.gs in your Google Apps Script project.
 */

const SPREADSHEET_ID = '1HTkRzSs8yavFTT-zqh-lHA_S2Be2X2A5Y1XMDyN13kw';
const SHEET_SALES = 'Ventas';
const SHEET_INVENTORY = 'PROCDINVENT';
const SHEET_CONFIG = 'Configuracion';

function doGet() {
  return HtmlService.createTemplateFromFile('index')
      .evaluate()
      .setTitle('ACI Movilnet POS')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Setup sheets if they don't exist
 */
function setupSheets() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  
  // 1. Setup Sales Sheet
  let salesSheet = ss.getSheetByName(SHEET_SALES);
  if (!salesSheet) {
    salesSheet = ss.insertSheet(SHEET_SALES);
    salesSheet.appendRow([
      'Fecha', 'ID Venta', 'Cliente', 'Cédula', 'Teléfono', 
      'Items (Resumen)', 'Total USD', 'Tasa Cambio', 'Total Bs', 
      'Forma Pago', 'Financiamiento', 'Observaciones', 'Link PDF'
    ]);
    salesSheet.getRange(1, 1, 1, 13).setFontWeight('bold').setBackground('#003399').setFontColor('white');
  }

  // 2. Setup Inventory Sheet (Mock Data if empty)
  // Nota: Se asume que la hoja ya existe con el formato de la imagen (Columna R en adelante)
  let invSheet = ss.getSheetByName(SHEET_INVENTORY);
  if (!invSheet) {
    invSheet = ss.insertSheet(SHEET_INVENTORY);
    // Solo crea estructura básica si no existe, pero tu hoja ya tiene datos en col R
    invSheet.getRange('R2').setValue('IMEI');
    invSheet.getRange('S2').setValue('Nombre Producto');
    invSheet.getRange('U2').setValue('Precio Base');
    invSheet.getRange('V2').setValue('Stock');
  }

  // 3. Setup Config Sheet
  let configSheet = ss.getSheetByName(SHEET_CONFIG);
  if (!configSheet) {
    configSheet = ss.insertSheet(SHEET_CONFIG);
    configSheet.appendRow(['Clave', 'Valor']);
    configSheet.appendRow(['TasaCambio', '37.5']);
  }
}

/**
 * Get Initial Settings (Exchange Rate)
 */
function getSettings() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEET_CONFIG);
  if (!sheet) {
    setupSheets();
    sheet = ss.getSheetByName(SHEET_CONFIG);
  }
  const data = sheet.getDataRange().getValues();
  let rate = 37.5;
  
  for(let i=1; i<data.length; i++) {
    if(data[i][0] === 'TasaCambio') {
      rate = Number(data[i][1]);
    }
  }
  return { exchangeRate: rate };
}

/**
 * Save Exchange Rate
 */
function saveExchangeRate(newRate) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEET_CONFIG);
  if (!sheet) return;
  
  const data = sheet.getDataRange().getValues();
  let found = false;
  
  for(let i=0; i<data.length; i++) {
    if(data[i][0] === 'TasaCambio') {
      sheet.getRange(i+1, 2).setValue(newRate);
      found = true;
      break;
    }
  }
  
  if (!found) {
    sheet.appendRow(['TasaCambio', newRate]);
  }
  return true;
}

/**
 * Fetch product by IMEI or Name from PROCDINVENT
 * CONSULTA: Columnas R, S, U, V según imagen.
 */
function getProductByTerm(term) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_INVENTORY);
  if (!sheet) return null;
  
  // Usamos getDisplayValues() para obtener todo como TEXTO.
  // Esto evita que los IMEI largos se conviertan a notación científica o pierdan precisión.
  const data = sheet.getDataRange().getDisplayValues(); 
  
  // Limpiamos el término de búsqueda (quitamos espacios y convertimos a texto)
  const search = String(term).trim().toLowerCase();
  
  // Según imagen: Encabezados en Fila 2 (índice 1), Datos empiezan en Fila 3 (índice 2)
  // Índices de columnas (A=0, ..., Q=16, R=17, S=18, T=19, U=20, V=21)
  const COL_IMEI = 17;   // Columna R
  const COL_NAME = 18;   // Columna S
  const COL_PRICE = 20;  // Columna U
  const COL_STOCK = 21;  // Columna V

  // Empezamos desde i=2 porque la fila 1 (índice 0) y fila 2 (índice 1) son encabezados o vacíos según imagen
  for (let i = 2; i < data.length; i++) {
    const row = data[i];
    
    // Verificamos que la fila tenga suficientes columnas
    if (row.length <= COL_STOCK) continue;

    // Obtenemos valores limpios
    const imei = String(row[COL_IMEI]).trim().toLowerCase();
    const name = String(row[COL_NAME]).toLowerCase();
    
    // Lógica de precio: quitar símbolos de moneda si existen (ej: "$2.00" -> "2.00")
    let priceStr = String(row[COL_PRICE]).replace(/[^0-9.,]/g, '').replace(',', '.');
    const price = parseFloat(priceStr) || 0;

    const stock = parseInt(String(row[COL_STOCK]).replace(/[^0-9]/g, '')) || 0;

    // Comparación: 
    // 1. IMEI exacto (texto vs texto)
    // 2. Nombre parcial (si escribes más de 3 letras)
    if (imei === search || (search.length > 3 && name.includes(search))) {
      return {
        imei: row[COL_IMEI], // Devolvemos el valor original de la celda
        name: row[COL_NAME],
        priceUSD: price,
        stock: stock
      };
    }
  }
  return null;
}

/**
 * Save Sale and create PDF
 */
function processSale(saleDataJSON) {
  try {
    const saleData = JSON.parse(saleDataJSON);
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_SALES);
    
    const saleId = 'VEN-' + Math.floor(Date.now() / 1000);
    const itemsSummary = saleData.items.map(i => `${i.quantity}x ${i.name}`).join(', ');
    const totalBs = saleData.totalUSD * saleData.exchangeRate;
    
    // 1. Create PDF
    const pdfUrl = createPDF(saleData, saleId);
    
    // 2. Save to Sheet
    sheet.appendRow([
      new Date(),
      saleId,
      saleData.customer.fullName,
      saleData.customer.cedula,
      saleData.customer.phone,
      itemsSummary,
      saleData.totalUSD,
      saleData.exchangeRate,
      totalBs,
      saleData.financing === 'Contado' ? 'Contado' : saleData.financing,
      saleData.financing !== 'Contado' ? 'SI' : 'NO',
      saleData.observations,
      pdfUrl
    ]);
    
    return {
      success: true,
      saleId: saleId,
      pdfUrl: pdfUrl
    };
    
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * Get Sales History
 */
function getSalesHistory() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_SALES);
  if (!sheet) return [];
  
  const rawData = sheet.getDataRange().getValues();
  if (rawData.length < 2) return [];

  const rows = rawData.slice(1).reverse();
  
  return rows.map(row => ({
    date: row[0],
    id: row[1],
    client: row[2],
    cedula: row[3],
    itemsSummary: row[5],
    totalUSD: Number(row[6]),
    totalBs: Number(row[8]),
    paymentMethod: row[9],
    financing: row[10],
    pdfUrl: row[12]
  }));
}

/**
 * Create a Professional PDF Receipt
 */
function createPDF(data, saleId) {
  const totalBs = data.totalUSD * data.exchangeRate;
  const logoUrl = "https://i.ibb.co/hFq3BtD9/Movilnet-logo-0.png";
  
  const fmtUSD = (n) => `$${n.toFixed(2)}`;
  const fmtBs = (n) => `Bs. ${n.toFixed(2)}`;

  let rows = data.items.map(item => `
    <tr style="border-bottom: 1px solid #eee;">
      <td style="padding: 10px; color: #333;">
        <div style="font-weight: bold;">${item.name}</div>
        <div style="font-size: 10px; color: #666;">IMEI: ${item.imei}</div>
      </td>
      <td style="padding: 10px; text-align: center;">${item.quantity}</td>
      <td style="padding: 10px; text-align: right;">${fmtUSD(item.priceUSD)}</td>
      <td style="padding: 10px; text-align: right; font-weight: bold;">${fmtUSD(item.priceUSD * item.quantity)}</td>
    </tr>
  `).join('');

  let installmentsHtml = '';
  if (data.financing !== 'Contado' && data.installments && data.installments.length > 0) {
     const instRows = data.installments.map(inst => `
        <tr>
           <td style="padding: 5px;">${inst.number}</td>
           <td style="padding: 5px;">${inst.date}</td>
           <td style="padding: 5px; text-align: right;">${fmtUSD(inst.amountUSD)}</td>
           <td style="padding: 5px; text-align: right; color: #666;">${fmtBs(inst.amountBs)}</td>
        </tr>
     `).join('');

     installmentsHtml = `
       <div style="margin-top: 20px; background-color: #f9f9f9; padding: 15px; border-radius: 5px;">
         <h3 style="color: #FF6600; font-size: 14px; margin-top: 0;">Plan de Financiamiento (${data.financing})</h3>
         <p style="font-size: 12px; margin: 5px 0;"><strong>Inicial:</strong> ${fmtUSD(data.initialPayment)}</p>
         <table style="width: 100%; font-size: 11px; border-collapse: collapse;">
           <thead>
             <tr style="border-bottom: 1px solid #ddd; color: #555;">
               <th style="text-align: left; padding: 5px;">#</th>
               <th style="text-align: left; padding: 5px;">Fecha</th>
               <th style="text-align: right; padding: 5px;">Monto $</th>
               <th style="text-align: right; padding: 5px;">Monto Bs</th>
             </tr>
           </thead>
           <tbody>${instRows}</tbody>
         </table>
       </div>
     `;
  }

  let html = `
    <html>
      <body style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px; color: #333;">
        <table style="width: 100%; border-bottom: 2px solid #FF6600; padding-bottom: 20px; margin-bottom: 20px;">
          <tr>
            <td valign="top" style="width: 60%;">
              <img src="${logoUrl}" style="height: 60px; margin-bottom: 10px;">
              <div style="color: #003399; font-size: 18px; font-weight: bold;">ACI MOVILNET</div>
              <div style="font-size: 12px; color: #555;">Av. Lara, Valencia, Venezuela</div>
              <div style="font-size: 12px; color: #555;">Tel: 0426 7408955</div>
            </td>
            <td valign="top" style="text-align: right;">
              <div style="font-size: 24px; font-weight: bold; color: #333;">RECIBO</div>
              <div style="font-size: 14px; color: #666; margin-top: 5px;"># ${saleId}</div>
              <div style="font-size: 12px; color: #666; margin-top: 5px;">Fecha: ${data.date}</div>
              <div style="font-size: 12px; color: #666;">Tasa: ${fmtBs(data.exchangeRate)}</div>
            </td>
          </tr>
        </table>
        <div style="margin-bottom: 20px; padding: 15px; background-color: #f4f6f8; border-radius: 5px;">
           <table style="width: 100%; font-size: 13px;">
             <tr>
               <td><strong>Cliente:</strong> ${data.customer.fullName}</td>
               <td><strong>Cédula:</strong> ${data.customer.cedula}</td>
               <td style="text-align: right;"><strong>Teléfono:</strong> ${data.customer.phone}</td>
             </tr>
           </table>
        </div>
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <thead>
            <tr style="background-color: #003399; color: white;">
              <th style="padding: 10px; text-align: left; border-top-left-radius: 4px;">Producto</th>
              <th style="padding: 10px; text-align: center;">Cant</th>
              <th style="padding: 10px; text-align: right;">Precio</th>
              <th style="padding: 10px; text-align: right; border-top-right-radius: 4px;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
          <tfoot>
             <tr>
               <td colspan="3" style="padding: 10px; text-align: right; font-weight: bold;">Total USD:</td>
               <td style="padding: 10px; text-align: right; font-weight: bold; font-size: 14px;">${fmtUSD(data.totalUSD)}</td>
             </tr>
             <tr>
               <td colspan="3" style="padding: 10px; text-align: right; color: #666;">Total Bs:</td>
               <td style="padding: 10px; text-align: right; font-weight: bold; color: #FF6600; font-size: 14px;">${fmtBs(totalBs)}</td>
             </tr>
          </tfoot>
        </table>
        ${installmentsHtml}
        <div style="margin-top: 20px; font-size: 12px; color: #777; border-left: 3px solid #ddd; padding-left: 10px;">
           <strong>Observaciones:</strong> ${data.observations || 'Ninguna'}
        </div>
        <div style="margin-top: 50px; text-align: center; font-size: 11px; color: #aaa; border-top: 1px solid #eee; padding-top: 10px;">
           Gracias por preferir a ACI Movilnet. La mejor tecnología a tu alcance.
        </div>
      </body>
    </html>
  `;
  
  const blob = Utilities.newBlob(html, MimeType.HTML).setName(saleId + ".html");
  const pdf = blob.getAs(MimeType.PDF).setName(`Recibo_${saleId}.pdf`);
  const file = DriveApp.createFile(pdf);
  
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  
  return file.getUrl();
}