# Proyecto «Ámbar Exitoso»

Objetivo: llevar a Ámbar Couture a ser la marca más fuerte del mercado y franquiciar con fuerza, porque **todo se mide, todo está escrito y todo se controla**. Se trabaja poco a poco, por etapas.

## Regla de organización del ERP (obligatoria)
- Cada función vive en el módulo que le corresponde y se reutiliza lo existente. Nada de menús sueltos, pantallas duplicadas ni dos formas de hacer lo mismo.
- Antes de crear algo, buscar si ya existe (ver CLAUDE.md). Si existe, se amplía.
- Todo lo que mueve plata debe cuadrar con Cierres de caja y llegar a Siigo.
- Toda acción importante queda en el historial (private.config_historial / historial del contrato).

## Etapa 1 · Orden y números claros (0–60 días)
1. Siigo conectado y alineado hasta el cierre de caja, incluida la nota crédito. **(construido; falta configurar y activar cada sede)**
   - Dónde vive: Configuración › Facturación por sede (credenciales, parámetros, cola); Contrato/Pago (factura, recibos, nota crédito); Depósitos (anticipo y devolución); Gastos y Proveedores (gasto / documento soporte); Cierres de caja (renglón «Siigo al día»).
   - Fase A: factura, recibo de caja, anticipo, devolución de anticipo, gastos (factura electrónica, cuenta de cobro, compra de vestidos), nota crédito, envío automático y cola con reintento.
   - Fase B: cuotas del Plan Ahorro (anticipo), ventas de vestidos, pagos a proveedores, traslados caja/banco/sedes, préstamos de socios, retenido de planes desistidos, saldos iniciales; cuentas configurables por la contadora.
2. **(construido, en Reportes y Estadísticas)** Tablero CEO en tiempo real: dónde está la plata, activos, pasivos (depósitos, Plan Ahorro, proveedores, socios), ganancia por sede, punto de equilibrio, proyección y semáforo por sede.
3. **(construido)** Datos limpios: origen de cada cita («¿Cómo nos conociste?» en la página de citas y canal calculado), códigos de vestido con talla (REF-TALLA), contratos firmados en el ERP, costo de cada vestido.
4. **(construido, sección 6 del Tablero CEO)** Embudo por sede: chats → citas → asistencia → contrato → ticket → ganancia; costo por cita y por contrato.

## Etapa 2 · Manual Ámbar (30–120 días)
**(versión 1 construida en Manuales › Manual Ámbar · Protocolos: 9 protocolos con lista de chequeo e indicador por sede de public.manual_indicadores; ajustar con las mejores asesoras y agregar videos.)**
Protocolo + lista de chequeo en el ERP + video por cada momento: atención (WhatsApp/IA/Instagram), primera cita, contrato (firma, abonos, Plan Ahorro, aliados), medidas y arreglos, entrega y depósito, devolución/lavandería/daños, caja, inventario, marketing local, personas. Cada protocolo con su indicador medido en el ERP. Vive en el módulo Manuales existente.

## Etapa 3 · Estándar y control (60–180 días)
**(Puntaje Ámbar por sede construido: public.puntaje_ambar, en Tablero CEO y Manual Ámbar. Auditoría mensual por sede construida: Manual Ámbar › Auditoría mensual, tabla auditorias_sede; vale 10 de los 100 puntos.)**
Puntaje Ámbar por sede (0–100), auditorías mensuales con lista de chequeo, Academia Ámbar (capacitación con evaluación), metas y comisiones calculadas por el ERP.

## Etapa 4 · Paquete de franquicia (4–12 meses)
Qué recibe el franquiciado (marca, manual, ERP con IA, marketing central, catálogo compartido, capacitación, aliados); modelo económico (entrada, regalía medida por el ERP, fondo de publicidad); perfil y ciudades; contrato con abogado y protección de marca; tablero del franquiciado y tablero de red.

## Metas para medirse
Cita → contrato > 40 % · chat de anuncio → cita > 10 % · contratos por aliados 30 % · margen por sede > 25 % · satisfacción «Excelente» > 90 % · caja cuadrada 100 % de los días.

## Pendiente del dueño
Visión a 3 años (sedes, ciudades, propias/franquicias); prácticas de las mejores asesoras; cifras base por sede (arriendo, nómina).
