import React, { useState, useEffect, useRef } from 'react';
import { Product, CartItem, Customer, FinancingProvider, SaleData, Installment, SaleHistoryItem } from './types';
import { calculateInstallments, formatCurrency } from './utils/calculations';
import { Invoice } from './components/Invoice';
import { Logo } from './components/Logo';

// Helper to run Google Apps Script server-side functions
const runGAS = (funcName: string, ...args: any[]) => {
  return new Promise<any>((resolve, reject) => {
    if (window.google && window.google.script) {
      window.google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler((error: any) => {
          console.error("GAS Error:", error);
          reject(error);
        })
        [funcName](...args);
    } else {
      console.warn("GAS Environment not found. Using Mock mode.");
      // Fallback mocks for development
      if (funcName === 'getSettings') resolve({ exchangeRate: 40.0 });
      if (funcName === 'getProductByTerm') {
        const mockDB = [
          { imei: '12345', name: 'Samsung Mock A15', priceUSD: 180, stock: 10 },
          { imei: '67890', name: 'Xiaomi Mock 13C', priceUSD: 140, stock: 5 },
        ];
        resolve(mockDB.find(p => p.imei === args[0] || p.name.includes(args[0])));
      }
      if (funcName === 'processSale') {
         setTimeout(() => resolve({ success: true, pdfUrl: 'https://example.com/mock.pdf' }), 1000);
      }
      if (funcName === 'saveExchangeRate') resolve(true);
      if (funcName === 'getSalesHistory') {
        resolve([
          { 
            date: new Date().toISOString(), 
            id: 'VEN-MOCK1', 
            client: 'Cliente Mock 1', 
            cedula: 'V123', 
            itemsSummary: '2x Tel', 
            totalUSD: 100, 
            totalBs: 4000, 
            paymentMethod: 'Contado', 
            financing: 'NO', 
            pdfUrl: '#' 
          }
        ]);
      }
    }
  });
};

const App = () => {
  // State
  const [view, setView] = useState<'pos' | 'history'>('pos');
  const [exchangeRate, setExchangeRate] = useState<number>(0); 
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [customer, setCustomer] = useState<Customer>({ fullName: '', cedula: '', phone: '' });
  const [financing, setFinancing] = useState<FinancingProvider>(FinancingProvider.NONE);
  const [observations, setObservations] = useState('');
  const [showReceipt, setShowReceipt] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [lastSale, setLastSale] = useState<{ pdfUrl: string, phone: string } | null>(null);
  
  // History State
  const [salesHistory, setSalesHistory] = useState<SaleHistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Load initial settings
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await runGAS('getSettings');
        if (settings && settings.exchangeRate) {
          setExchangeRate(settings.exchangeRate);
        }
      } catch (e) {
        console.error("Failed to load settings", e);
      }
    };
    loadSettings();
  }, []);

  // Fetch History when view changes
  useEffect(() => {
    if (view === 'history') {
      const fetchHistory = async () => {
        setIsLoadingHistory(true);
        try {
          const data = await runGAS('getSalesHistory');
          setSalesHistory(data);
        } catch (e) {
          alert('Error al cargar el historial');
        } finally {
          setIsLoadingHistory(false);
        }
      };
      fetchHistory();
    }
  }, [view]);

  // Search/Scan Handler
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;

    setIsSearching(true);
    try {
      const product = await runGAS('getProductByTerm', searchTerm);
      
      if (product) {
        addToCart(product);
        setSearchTerm(''); // Clear input for next scan
      } else {
        alert(`Producto no encontrado. \n\nVerifique que el IMEI "${searchTerm}" esté registrado correctamente en la hoja PROCDINVENT de su Google Sheet.`);
      }
    } catch (e) {
      alert('Error de conexión al buscar producto.');
    } finally {
      setIsSearching(false);
    }
  };

  const saveRate = async () => {
    try {
      await runGAS('saveExchangeRate', exchangeRate);
      alert('Tasa guardada exitosamente');
    } catch(e) {
      alert('Error al guardar tasa');
    }
  };

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.imei === product.imei);
      if (existing) {
        return prev.map(item => item.imei === product.imei ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const removeFromCart = (imei: string) => {
    setCart(prev => prev.filter(item => item.imei !== imei));
  };

  // Calculations
  const totalUSD = cart.reduce((acc, item) => acc + (item.priceUSD * item.quantity), 0);
  const financialPlan = calculateInstallments(totalUSD, financing, exchangeRate);

  const handleProcessSale = () => {
    if (cart.length === 0 || !customer.fullName || !customer.cedula) {
      alert('Por favor complete los datos del cliente y agregue productos.');
      return;
    }
    setShowReceipt(true);
  };

  const confirmSale = async () => {
    setIsProcessing(true);
    
    const saleData: SaleData = {
      customer,
      items: cart,
      exchangeRate,
      financing,
      installments: financialPlan.installments,
      initialPayment: financialPlan.initial,
      totalUSD,
      observations,
      date: new Date().toLocaleDateString('es-VE')
    };

    try {
      const result = await runGAS('processSale', JSON.stringify(saleData));
      if (result.success) {
        setLastSale({ pdfUrl: result.pdfUrl, phone: customer.phone });
        setShowReceipt(false);
        setCart([]);
        setCustomer({ fullName: '', cedula: '', phone: '' });
        setFinancing(FinancingProvider.NONE);
        setObservations('');
      } else {
        alert('Error al procesar la venta: ' + result.error);
      }
    } catch (e) {
       alert('Error de conexión con el servidor.');
    } finally {
      setIsProcessing(false);
    }
  };

  const sendWhatsapp = () => {
    if (!lastSale) return;
    const msg = `Hola ${customer.fullName}, gracias por su compra en ACI Movilnet. Aquí puede descargar su recibo: ${lastSale.pdfUrl}`;
    const url = `https://wa.me/${lastSale.phone}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col font-sans text-gray-800">
      
      {/* Top Bar */}
      <header className="bg-white shadow-sm border-b border-gray-200 p-4 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center space-x-3 w-full md:w-auto">
            <Logo className="h-10" />
            <div className="hidden md:block">
              <h1 className="text-xl font-bold text-movilnet-blue leading-tight">ACI Movilnet</h1>
              <p className="text-xs text-gray-500">Sistema de Ventas & Inventario</p>
            </div>
            
            {/* Navigation Switch */}
            <div className="flex bg-gray-100 p-1 rounded-lg ml-8">
              <button 
                onClick={() => setView('pos')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${view === 'pos' ? 'bg-white text-movilnet-blue shadow' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <i className="fa-solid fa-cash-register mr-2"></i>
                Venta
              </button>
              <button 
                onClick={() => setView('history')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${view === 'history' ? 'bg-white text-movilnet-blue shadow' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <i className="fa-solid fa-clock-rotate-left mr-2"></i>
                Historial
              </button>
            </div>
          </div>
          
          <div className="flex items-center gap-4 w-full md:w-auto justify-end">
            <div className="bg-movilnet-light px-4 py-2 rounded-lg flex flex-col items-end border border-gray-200">
              <span className="text-xs text-gray-500 font-medium uppercase">Tasa BCV/Paralelo</span>
              <div className="flex items-center gap-2">
                <span className="text-gray-400 text-sm">Bs/$</span>
                <input 
                  type="number" 
                  value={exchangeRate} 
                  onChange={(e) => setExchangeRate(parseFloat(e.target.value))}
                  className="w-16 bg-transparent text-right font-bold text-movilnet-blue focus:outline-none border-b border-gray-300 focus:border-movilnet-orange"
                />
                <button onClick={saveRate} className="text-gray-400 hover:text-movilnet-blue" title="Guardar Tasa">
                  <i className="fa-solid fa-floppy-disk"></i>
                </button>
              </div>
            </div>
            <div className="text-right hidden sm:block">
              <p className="text-sm font-bold text-gray-700 capitalize">{new Date().toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-grow p-4 md:p-6 max-w-7xl mx-auto w-full">
        
        {view === 'history' ? (
          // History View
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col h-[calc(100vh-140px)]">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h2 className="font-bold text-lg text-gray-800">Historial de Ventas</h2>
              <button 
                onClick={() => setView('pos')} 
                className="text-movilnet-blue text-sm font-medium hover:underline"
              >
                <i className="fa-solid fa-arrow-left mr-1"></i> Volver a Venta
              </button>
            </div>
            
            <div className="overflow-auto flex-grow p-4">
              {isLoadingHistory ? (
                <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                   <i className="fa-solid fa-spinner fa-spin text-3xl mb-3"></i>
                   <p>Cargando historial...</p>
                </div>
              ) : salesHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                  <i className="fa-regular fa-folder-open text-4xl mb-3 opacity-30"></i>
                  <p>No hay ventas registradas.</p>
                </div>
              ) : (
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-gray-500 uppercase bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-3">Fecha</th>
                      <th className="px-4 py-3">ID Venta</th>
                      <th className="px-4 py-3">Cliente</th>
                      <th className="px-4 py-3">Items</th>
                      <th className="px-4 py-3 text-right">Total USD</th>
                      <th className="px-4 py-3 text-right">Total Bs</th>
                      <th className="px-4 py-3 text-center">Tipo</th>
                      <th className="px-4 py-3 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {salesHistory.map((sale) => (
                      <tr key={sale.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-600">
                          {new Date(sale.date).toLocaleDateString('es-VE')}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-500">{sale.id}</td>
                        <td className="px-4 py-3 font-medium text-gray-800">
                          {sale.client}
                          <div className="text-xs text-gray-400">{sale.cedula}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-500 truncate max-w-[200px]" title={sale.itemsSummary}>
                          {sale.itemsSummary}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-gray-700">{formatCurrency(sale.totalUSD, 'USD')}</td>
                        <td className="px-4 py-3 text-right text-gray-500">{formatCurrency(sale.totalBs, 'VES')}</td>
                        <td className="px-4 py-3 text-center">
                          {sale.financing !== 'NO' ? (
                             <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded text-xs">Crédito</span>
                          ) : (
                             <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs">Contado</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <a 
                            href={sale.pdfUrl} 
                            target="_blank" 
                            rel="noreferrer"
                            className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 hover:bg-movilnet-blue hover:text-white transition-colors text-gray-500"
                            title="Ver Recibo PDF"
                          >
                            <i className="fa-solid fa-file-pdf"></i>
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        ) : (
          // POS View Grid
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left Column: Input & Cart */}
            <div className="lg:col-span-7 flex flex-col gap-6">
              
              {/* Product Scanner */}
              <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                <form onSubmit={handleSearch} className="relative">
                  <i className="fa-solid fa-barcode absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg"></i>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Escanear código IMEI o buscar por nombre..."
                    className="w-full pl-12 pr-4 py-3 rounded-lg border border-gray-200 focus:border-movilnet-orange focus:ring-2 focus:ring-orange-100 transition-all text-lg outline-none"
                    autoFocus
                    disabled={isSearching}
                  />
                  <button 
                    type="submit" 
                    disabled={isSearching}
                    className="absolute right-2 top-2 bg-movilnet-blue text-white px-6 py-1.5 rounded-md hover:bg-blue-800 transition-colors text-sm font-medium disabled:opacity-50"
                  >
                    {isSearching ? <i className="fa-solid fa-spinner fa-spin"></i> : 'Agregar'}
                  </button>
                </form>
              </div>

              {/* Cart List */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex-grow flex flex-col overflow-hidden h-[500px] lg:h-auto">
                <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                  <h2 className="font-bold text-gray-700"><i className="fa-solid fa-cart-shopping mr-2"></i>Carrito de Compra</h2>
                  <span className="bg-movilnet-orange text-white text-xs px-2 py-1 rounded-full">{cart.length} items</span>
                </div>
                <div className="overflow-y-auto flex-grow p-2 space-y-2 no-scrollbar">
                  {cart.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-gray-400">
                      <i className="fa-solid fa-basket-shopping text-4xl mb-3 opacity-20"></i>
                      <p>Escanea un producto para comenzar</p>
                    </div>
                  ) : (
                    cart.map((item, idx) => (
                      <div key={`${item.imei}-${idx}`} className="flex justify-between items-center p-3 hover:bg-gray-50 rounded-lg group transition-colors border border-transparent hover:border-gray-200">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 bg-blue-50 text-movilnet-blue rounded-full flex items-center justify-center font-bold text-sm">
                            {item.quantity}x
                          </div>
                          <div>
                            <p className="font-medium text-gray-800">{item.name}</p>
                            <p className="text-xs text-gray-500 font-mono tracking-wide">IMEI: {item.imei}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="font-bold text-gray-800">{formatCurrency(item.priceUSD * item.quantity, 'USD')}</p>
                            <p className="text-xs text-gray-400 font-medium">{formatCurrency(item.priceUSD * item.quantity * exchangeRate, 'VES')}</p>
                          </div>
                          <button 
                            onClick={() => removeFromCart(item.imei)}
                            className="text-gray-300 hover:text-red-500 p-2 transition-colors"
                          >
                            <i className="fa-solid fa-trash"></i>
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                
                {/* Cart Totals */}
                <div className="p-5 bg-gray-50 border-t border-gray-200">
                  <div className="flex justify-between items-end mb-2">
                    <span className="text-gray-600 font-medium">Total USD</span>
                    <span className="text-3xl font-bold text-movilnet-blue">{formatCurrency(totalUSD, 'USD')}</span>
                  </div>
                  <div className="flex justify-between items-end">
                    <span className="text-gray-500 text-sm">Total Bs (Tasa: {exchangeRate})</span>
                    <span className="text-xl font-bold text-movilnet-orange">{formatCurrency(totalUSD * exchangeRate, 'VES')}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Customer & Payment */}
            <div className="lg:col-span-5 flex flex-col gap-6">
              
              {/* Customer Form */}
              <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                <h2 className="font-bold text-gray-700 mb-4 flex items-center gap-2">
                  <i className="fa-regular fa-user"></i> Datos del Cliente
                </h2>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Cédula de Identidad</label>
                    <input 
                      type="text" 
                      value={customer.cedula}
                      onChange={e => setCustomer({...customer, cedula: e.target.value})}
                      className="w-full p-2 border border-gray-300 rounded focus:border-movilnet-blue outline-none transition-colors"
                      placeholder="V-12345678"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Nombre y Apellido</label>
                    <input 
                      type="text" 
                      value={customer.fullName}
                      onChange={e => setCustomer({...customer, fullName: e.target.value})}
                      className="w-full p-2 border border-gray-300 rounded focus:border-movilnet-blue outline-none transition-colors"
                      placeholder="Juan Pérez"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Teléfono (WhatsApp)</label>
                    <input 
                      type="text" 
                      value={customer.phone}
                      onChange={e => setCustomer({...customer, phone: e.target.value})}
                      className="w-full p-2 border border-gray-300 rounded focus:border-movilnet-blue outline-none transition-colors"
                      placeholder="58412..."
                    />
                  </div>
                </div>
              </div>

              {/* Payment & Financing */}
              <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex-grow">
                <h2 className="font-bold text-gray-700 mb-4 flex items-center gap-2">
                  <i className="fa-regular fa-credit-card"></i> Pago y Financiamiento
                </h2>
                
                <div className="mb-4">
                  <label className="block text-xs font-medium text-gray-500 mb-2">Modalidad de Pago</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button 
                      onClick={() => setFinancing(FinancingProvider.NONE)}
                      className={`py-2 px-3 rounded text-sm font-medium border transition-all ${financing === FinancingProvider.NONE ? 'bg-movilnet-blue text-white border-movilnet-blue shadow-md' : 'bg-white text-gray-600 border-gray-200 hover:border-movilnet-blue'}`}
                    >
                      Contado
                    </button>
                    <select 
                      className={`py-2 px-3 rounded text-sm font-medium border outline-none transition-all ${financing !== FinancingProvider.NONE ? 'bg-movilnet-orange text-white border-movilnet-orange shadow-md' : 'bg-white text-gray-600 border-gray-200'}`}
                      onChange={(e) => setFinancing(e.target.value as FinancingProvider)}
                      value={financing === FinancingProvider.NONE ? '' : financing}
                    >
                      <option value="" disabled>Crédito / Apps</option>
                      <option value={FinancingProvider.CASHEA}>Cashea</option>
                      <option value={FinancingProvider.ZONA_NARANJA}>Zona Naranja</option>
                      <option value={FinancingProvider.WEPA}>Wepa</option>
                      <option value={FinancingProvider.CHOLLO}>Chollo</option>
                    </select>
                  </div>
                </div>

                {/* Financial Breakdown */}
                {financing !== FinancingProvider.NONE && (
                  <div className="bg-orange-50 p-4 rounded-lg border border-orange-100 mb-4 animate-fade-in">
                    <div className="flex justify-between mb-2 pb-2 border-b border-orange-200">
                      <div>
                        <span className="block text-xs text-orange-600">Inicial a Pagar</span>
                        <span className="font-bold text-orange-800 text-lg">{formatCurrency(financialPlan.initial, 'USD')}</span>
                      </div>
                      <div className="text-right">
                        <span className="block text-xs text-orange-600">En Bolívares</span>
                        <span className="font-bold text-orange-800 text-lg">{formatCurrency(financialPlan.initial * exchangeRate, 'VES')}</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-orange-700 font-medium">Cuotas Quincenales Estimadas:</p>
                      {financialPlan.installments.map((inst) => (
                        <div key={inst.number} className="flex justify-between text-xs text-orange-600">
                          <span>{inst.number}. {inst.date}</span>
                          <span>{formatCurrency(inst.amountUSD, 'USD')} / {formatCurrency(inst.amountBs, 'VES')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mb-6">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Observaciones</label>
                  <textarea 
                    value={observations}
                    onChange={e => setObservations(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded h-20 text-sm focus:border-movilnet-blue outline-none resize-none"
                  ></textarea>
                </div>

                <button 
                  onClick={handleProcessSale}
                  className="w-full bg-movilnet-blue hover:bg-blue-800 text-white font-bold py-4 rounded-lg shadow-lg shadow-blue-200 transition-all transform hover:-translate-y-1 flex justify-center items-center gap-2"
                >
                  <span>Procesar Venta</span>
                  <i className="fa-solid fa-check"></i>
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Success Modal / Action Sheet */}
      {lastSale && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 text-center">
            <div className="w-16 h-16 bg-green-100 text-green-500 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">
              <i className="fa-solid fa-check"></i>
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">¡Venta Exitosa!</h2>
            <p className="text-gray-500 mb-6">La venta ha sido registrada correctamente.</p>
            
            <div className="grid gap-3">
              <button 
                onClick={sendWhatsapp}
                className="w-full bg-[#25D366] hover:bg-[#128C7E] text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <i className="fa-brands fa-whatsapp text-xl"></i>
                Enviar Recibo por WhatsApp
              </button>
              <button 
                onClick={() => setLastSale(null)}
                className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-3 rounded-xl transition-colors"
              >
                Nueva Venta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receipt Preview Modal */}
      {showReceipt && !lastSale && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 overflow-y-auto p-4 md:p-8 flex items-start justify-center">
          <div className="bg-white w-full max-w-3xl rounded shadow-2xl overflow-hidden relative">
            <div className="sticky top-0 bg-gray-100 p-3 border-b border-gray-300 flex justify-between items-center z-10">
              <h3 className="font-bold text-gray-700">Confirmar Venta</h3>
              <div className="flex gap-2">
                <button onClick={() => setShowReceipt(false)} className="px-3 py-1 text-gray-600 hover:bg-gray-200 rounded">Cancelar</button>
                <button 
                  onClick={confirmSale} 
                  disabled={isProcessing}
                  className="px-4 py-1 bg-movilnet-blue text-white rounded hover:bg-blue-800 disabled:opacity-50 flex items-center gap-2"
                >
                  {isProcessing && <i className="fa-solid fa-spinner fa-spin"></i>}
                  {isProcessing ? 'Procesando...' : 'Confirmar y Guardar'}
                </button>
              </div>
            </div>
            <div className="overflow-auto bg-gray-500 p-4 md:p-8">
               {/* Pass data to Receipt Component */}
               <Invoice 
                 data={{
                    customer,
                    items: cart,
                    exchangeRate,
                    financing,
                    installments: financialPlan.installments,
                    initialPayment: financialPlan.initial,
                    totalUSD,
                    observations,
                    date: new Date().toLocaleDateString('es-VE')
                 }} 
               />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;