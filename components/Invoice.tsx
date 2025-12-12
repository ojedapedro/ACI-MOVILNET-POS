import React from 'react';
import { SaleData, FinancingProvider } from '../types';
import { formatCurrency } from '../utils/calculations';
import { Logo } from './Logo';

interface InvoiceProps {
  data: SaleData;
  refProp?: React.RefObject<HTMLDivElement>;
}

export const Invoice: React.FC<InvoiceProps> = ({ data, refProp }) => {
  return (
    <div ref={refProp} className="bg-white p-8 max-w-[800px] mx-auto text-sm text-gray-800" id="invoice-capture">
      {/* Header */}
      <div className="flex justify-between items-start border-b-2 border-movilnet-orange pb-6 mb-6">
        <div>
          <Logo className="h-16 mb-2" />
          <h1 className="text-xl font-bold text-movilnet-blue">ACI MOVILNET</h1>
          <p className="text-gray-500">J-12345678-9</p>
          <p>Av. Lara, Valencia, Venezuela</p>
          <p>Tel: 0426 7408955</p>
        </div>
        <div className="text-right">
          <h2 className="text-2xl font-bold text-gray-800">RECIBO DE VENTA</h2>
          <p className="mt-2 text-gray-600">Fecha: {data.date}</p>
          <p className="text-gray-600">Tasa BCV: {formatCurrency(data.exchangeRate, 'VES')}</p>
        </div>
      </div>

      {/* Customer Info */}
      <div className="bg-gray-50 p-4 rounded mb-6">
        <h3 className="font-bold text-movilnet-blue mb-2 uppercase text-xs tracking-wider">Datos del Cliente</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-gray-500 block text-xs">Nombre:</span>
            <span className="font-medium">{data.customer.fullName}</span>
          </div>
          <div>
            <span className="text-gray-500 block text-xs">Cédula:</span>
            <span className="font-medium">{data.customer.cedula}</span>
          </div>
          <div>
            <span className="text-gray-500 block text-xs">Teléfono:</span>
            <span className="font-medium">{data.customer.phone}</span>
          </div>
        </div>
      </div>

      {/* Items */}
      <table className="w-full mb-8">
        <thead>
          <tr className="bg-movilnet-blue text-white">
            <th className="py-2 px-3 text-left rounded-tl">Descripción / IMEI</th>
            <th className="py-2 px-3 text-center">Cant.</th>
            <th className="py-2 px-3 text-right">Precio ($)</th>
            <th className="py-2 px-3 text-right rounded-tr">Total ($)</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item, index) => (
            <tr key={index} className="border-b border-gray-100">
              <td className="py-3 px-3">
                <div className="font-medium">{item.name}</div>
                <div className="text-xs text-gray-500 font-mono">{item.imei}</div>
              </td>
              <td className="py-3 px-3 text-center">{item.quantity}</td>
              <td className="py-3 px-3 text-right">{formatCurrency(item.priceUSD, 'USD')}</td>
              <td className="py-3 px-3 text-right font-bold">{formatCurrency(item.priceUSD * item.quantity, 'USD')}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3} className="pt-4 text-right font-bold text-gray-600">Total USD:</td>
            <td className="pt-4 px-3 text-right font-bold text-xl">{formatCurrency(data.totalUSD, 'USD')}</td>
          </tr>
          <tr>
            <td colSpan={3} className="text-right font-bold text-gray-600">Total Bs (Ref):</td>
            <td className="px-3 text-right font-bold text-lg text-movilnet-orange">{formatCurrency(data.totalUSD * data.exchangeRate, 'VES')}</td>
          </tr>
        </tfoot>
      </table>

      {/* Payment Details */}
      <div className="grid grid-cols-2 gap-8 mb-6">
        <div>
          <h3 className="font-bold text-movilnet-blue mb-2 text-sm">Detalles de Pago</h3>
          <p><span className="text-gray-500 text-xs">Modalidad:</span> {data.financing === FinancingProvider.NONE ? 'Contado' : 'Crédito'}</p>
          {data.financing !== FinancingProvider.NONE && (
            <p><span className="text-gray-500 text-xs">Financiamiento:</span> <span className="font-bold text-movilnet-orange">{data.financing}</span></p>
          )}
        </div>
        
        {data.observations && (
          <div>
            <h3 className="font-bold text-movilnet-blue mb-2 text-sm">Observaciones</h3>
            <p className="text-gray-600 text-sm italic">{data.observations}</p>
          </div>
        )}
      </div>

      {/* Installments Table */}
      {data.financing !== FinancingProvider.NONE && data.installments.length > 0 && (
        <div className="mt-4 border border-gray-200 rounded overflow-hidden">
          <div className="bg-gray-100 px-4 py-2 border-b border-gray-200 font-bold text-gray-700 text-sm flex justify-between">
            <span>Plan de Financiamiento</span>
            <span>Inicial: {formatCurrency(data.initialPayment, 'USD')}</span>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 text-gray-500">
                <th className="py-2 px-4 text-left">Cuota #</th>
                <th className="py-2 px-4 text-left">Fecha</th>
                <th className="py-2 px-4 text-right">Monto $</th>
                <th className="py-2 px-4 text-right">Monto Bs (Est.)</th>
              </tr>
            </thead>
            <tbody>
              {data.installments.map((inst) => (
                <tr key={inst.number} className="border-t border-gray-100">
                  <td className="py-2 px-4 font-medium">{inst.number}</td>
                  <td className="py-2 px-4">{inst.date}</td>
                  <td className="py-2 px-4 text-right font-bold">{formatCurrency(inst.amountUSD, 'USD')}</td>
                  <td className="py-2 px-4 text-right text-gray-500">{formatCurrency(inst.amountBs, 'VES')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-12 pt-6 border-t border-gray-200 text-center text-xs text-gray-400">
        <p>Gracias por su compra. Conserve este recibo para efectos de garantía.</p>
        <p className="mt-1">ACI Movilnet - Conectados contigo</p>
      </div>
    </div>
  );
};