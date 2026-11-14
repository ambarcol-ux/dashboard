'use client';
import {KanbanSquare} from 'lucide-react';
import SupplierShell from '@/components/suppliers/SupplierShell';
import CrmPipeline from '@/components/CrmPipeline';

/** Ventas y CRM › Pipeline: each customer in her stage, moved automatically by what the ERP records, with what to do next. */
export default function PipelinePage(){
 return <SupplierShell activePage="pipeline" crumb="Ventas y CRM / Pipeline" title="Pipeline" icon={<KanbanSquare/>}
  description="Cada clienta en su etapa: interesada, cita agendada, asistió, seguimiento, contrato o cerrada. Cambia de etapa sola y avisa lo que hay que hacer.">
  {profile=><CrmPipeline admin={profile.rol==='admin'} sedeId={profile.sede_id}/>}
 </SupplierShell>;
}
