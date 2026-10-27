# Paso 10 – Convivencia con Meta Business Agent
En app/api/primeras-citas/whatsapp/route.ts y app/api/primeras-citas/procesar/route.ts:
- Primero revisa la documentación oficial de Meta sobre Thread Control y webhooks en espera (standby) de Meta Business Agent; si algo no es posible con la cuenta actual, detente y explícalo en una línea.
- Aceptar y registrar los webhooks en espera: el ERP guarda las conversaciones que atiende el agente sin responder.
- Cuando el ERP deba enviar un mensaje no plantilla en una conversación del agente (respuesta de primeras citas o asesora), tomar el control, enviar y devolver el control al agente.
- Las plantillas de primeras citas siguen funcionando igual.
- En el ERP, botón "Tomar conversación" / "Devolver al agente" para asesoras.
- Interruptor por empresa en la configuración del paso 8 para activar o desactivar esta convivencia.

===FIN===
