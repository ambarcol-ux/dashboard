import fs from 'fs';
import path from 'path';

const filePath = path.join(process.cwd(), 'components/ContractTemplate.tsx');
let content = fs.readFileSync(filePath, 'utf-8');
const lines = content.split('\n');

// Replace imports
const importTarget = "import React from 'react';";
const importReplace = "import React, { useEffect, useState } from 'react';\nimport { supabase } from '@/lib/supabase';";
content = content.replace(importTarget, importReplace);

// Replace props and component start
const propsTarget = `interface ContractTemplateProps {
  data: ContractData;
}

export default function ContractTemplate({ data }: ContractTemplateProps) {`;

const propsReplace = `interface ContractTemplateProps {
  data: ContractData;
  plantillas?: any[];
}

export default function ContractTemplate({ data, plantillas: propPlantillas }: ContractTemplateProps) {
  const [plantillas, setPlantillas] = useState<any[]>(propPlantillas || []);

  useEffect(() => {
    if (!propPlantillas || propPlantillas.length === 0) {
      const fetchPlantillas = async () => {
        const { data: pData } = await supabase
          .from('plantillas_contratos')
          .select('*')
          .order('numero_orden', { ascending: true });
        if (pData) setPlantillas(pData);
      };
      fetchPlantillas();
    } else {
      setPlantillas(propPlantillas);
    }
  }, [propPlantillas]);

  const parseContenido = (html: string) => {
    let parsed = html;
    parsed = parsed.replace(/\\{\\{VALOR_TOTAL\\}\\}/g, formatCurrency(data.valor_total));
    parsed = parsed.replace(/\\{\\{AUTORIZA_IMAGEN_SI\\}\\}/g, data.autoriza_uso_imagen ? 'X' : ' ');
    parsed = parsed.replace(/\\{\\{AUTORIZA_IMAGEN_NO\\}\\}/g, !data.autoriza_uso_imagen ? 'X' : ' ');
    return parsed;
  };`;
content = content.replace(propsTarget, propsReplace);

// Replace clauses block
const newLines = content.split('\n');
const startIndex = newLines.findIndex(l => l.includes('{/* Cláusulas del Contrato */}'));
const endIndex = newLines.findIndex((l, i) => i > startIndex && l.includes('{/* Firmas - Refactorizadas a 2 columnas con efecto de estampado y prevención de salto de página */}'));

if (startIndex !== -1 && endIndex !== -1) {
  const replacement = `        {/* Cláusulas del Contrato */}
        <h2 className="text-xl font-bold mb-6 text-center underline tracking-wide">CLÁUSULAS</h2>

        <div className="space-y-6 text-base md:text-lg">
          {plantillas.length === 0 ? (
            <div className="text-center text-gray-500 py-10" id="loading-contrato">Cargando cláusulas del contrato...</div>
          ) : (
            plantillas.map((plantilla) => {
              // Filtrado condicional: Solo mostrar cláusulas PreXV si aplica
              if (plantilla.titulo.includes('[PreXV]') && data.tipo_evento !== 'PreXV' && data.tipo_evento !== 'Ambos') {
                return null;
              }
              
              const tituloLimpio = plantilla.titulo.replace('[PreXV] ', '');
              
              return (
                <div key={plantilla.id} className="space-y-2 text-justify">
                  {tituloLimpio && (
                    <p><strong>{tituloLimpio}</strong></p>
                  )}
                  <div 
                    className="space-y-4"
                    dangerouslySetInnerHTML={{ __html: parseContenido(plantilla.contenido) }} 
                  />
                </div>
              );
            })
          )}
        </div>
`;
  
  newLines.splice(startIndex, endIndex - startIndex, replacement);
  fs.writeFileSync(filePath, newLines.join('\n'));
  console.log("Refactoring complete");
} else {
  console.log("Could not find start/end bounds for clauses block");
}
