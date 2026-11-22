'use client';
import {Landmark} from 'lucide-react';
import SupplierShell from '@/components/suppliers/SupplierShell';
import BankReconciliation from '@/components/BankReconciliation';

/** Finanzas › Bancos y conciliación (administración y contabilidad). */
export default function BancosPage(){
 return <SupplierShell activePage="bancos" crumb="Finanzas / Bancos" title="Bancos y conciliación" icon={<Landmark/>}
  description="Sube el extracto de cada cuenta y crúzalo con lo que el ERP registra: lo que está en el banco y no en el ERP, o al revés, queda a la vista para revisarlo.">
  {()=><BankReconciliation/>}
 </SupplierShell>;
}
