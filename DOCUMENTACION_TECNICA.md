# Documentación Técnica - ERP Ámbar Couture

Esta documentación técnica detalla la arquitectura, el diseño de la base de datos, los componentes frontend y las prácticas de despliegue continuo del sistema ERP a la medida de Ámbar Couture. Este documento se centra exclusivamente en la infraestructura de Next.js (Vercel) y las bases nativas en Supabase.

---

## 1. ARQUITECTURA GENERAL Y STACK CORE

### Entorno Web
El sistema está construido utilizando **Next.js** (App Router) como framework de React, proporcionando renderizado híbrido y optimización de rendimiento. La interfaz de usuario está estilizada con **Tailwind CSS**, lo que permite un diseño altamente responsivo y personalizado mediante clases utilitarias.

* **Construcción y Compilación:** La aplicación se empaqueta para producción mediante el comando estándar `npm run build`, optimizando los recursos estáticos y generando las rutas dinámicas.
* **Hosting y Despliegue:** El entorno web está alojado y desplegado de forma automatizada en **Vercel**, asociado de manera directa al dominio principal en producción: `erp.ambarcouture.com`.

### Infraestructura Back-End
El back-end se apoya en una arquitectura Serverless utilizando **Supabase** como plataforma (Backend-as-a-Service):
* **Persistencia de Datos (PostgreSQL):** Base de datos relacional nativa y escalable para almacenar toda la información operativa del negocio. Las interacciones se realizan mediante el cliente oficial `@supabase/supabase-js`.
* **Autenticación (Auth):** El manejo de sesiones, control de acceso y seguridad se implementa de manera nativa mediante Supabase Auth, asegurando los endpoints y protegiendo las rutas de la aplicación de Next.js.

---

## 2. DISEÑO Y ESQUEMA DE BASE DE DATOS (SUPABASE)

Se detalla a continuación el análisis de las tablas estructuradas a la medida, con un enfoque en su lógica de negocio integrada:

### Tabla `plantillas_contratos` (Orden de Cláusulas)
Esta tabla actúa como el repositorio central y dinámico de los textos legales para el ERP. Su diseño permite la gestión "en caliente" de las condiciones del servicio.
* **Estructura Dinámica de Almacenamiento:** Contiene campos clave como `id`, `numero_orden` (para el control del orden en el que se imprimen las cláusulas), `titulo` y `contenido` (en formato enriquecido/HTML).
* **Lógica de Negocio:** Permite a los administradores del ERP (a través de la vista de "Administración de Contratos") editar, actualizar y organizar los parágrafos legales, cláusulas para eventos y pre-quinceañeras directamente desde un cuadro de texto en la interfaz gráfica. Los cambios se persisten inmediatamente mediante la función `supabase.from('plantillas_contratos').update()` sin necesidad de tocar el código fuente, aplicar migraciones o realizar nuevos despliegues.

### Tabla `control_horarios` (Horarios Semanales)
Estructura relacional utilizada para registrar y validar la asistencia y el cumplimiento de turnos del personal (asesoras) a través de las diferentes sucursales físicas (Sedes).
* **Campos Estructurados:** Almacena métricas exactas por asesor(a) (`asesora_id`), sede (`sede_id`), fechas específicas, horas de asignación (`hora_entrada_asignada`, `hora_salida_asignada`), horas reales de marcación (`hora_entrada_real`, `hora_salida_real`), e indicadores de tiempo de almuerzo (`con_almuerzo`).
* **Control por Showrooms:** Facilita el filtrado y agrupamiento lógico de la operación por sedes físicas (ej. Bogotá, Barranquilla, Villavicencio).
* **Validación Lógica (Jornada de 44 Horas Semanales):** Implementa el cálculo automático de los `minutos_trabajados`, deduciendo los horarios de almuerzo, sumando un total que se cruza contra el límite de 2640 minutos (44 horas semanales de lunes a sábado). El sistema detecta y expone visualmente si existe un excedente (horas extras) o falencias en el cumplimiento, separando de forma estructurada las horas del día domingo.

---

## 3. VISTAS Y COMPONENTES FRONTEND (NEXT.JS & TAILWIND CSS)

### Módulo Maestro de Contratos
La sección de contratos (`/dashboard/admin/contratos` y componentes asociados como `ContractTemplate`) está diseñada como una herramienta interactiva para agilizar la firma y estandarización legal.
* **Interfaz Interactiva de Edición:** Proporciona áreas de texto y controles de guardado asíncrono para mutar la tabla de `plantillas_contratos` con validación de estado en tiempo real (loaders, notificaciones "toast").
* **Carga Asíncrona:** Inyecta de forma dinámica las cláusulas desde Supabase en las instancias de generación del documento final (PDF/Impresión). Las plantillas respetan la inyección de variables como totales financieros, fechas del evento, saldos y nombres de contratantes.
* **Maquetación CSS Optimizada para Impresión:** Se emplean directivas CSS avanzadas integradas (como variables de color hexadecimales fijas, la directiva `@media print` mitigando conflictos con OKLCH de Tailwind y utilidades como `breakInside: 'avoid'`). Esto garantiza que los contratos físicos, una vez generados para su impresión o exportación en PDF, no sufran saltos de página indebidos en las zonas de firmas y mantengan una pureza visual legal-estándar.

### Seguridad y Autenticación
* **Recuperación de Accesos (`resetPasswordForEmail`):** El sistema aborda el restablecimiento de credenciales llamando al método nativo `supabase.auth.resetPasswordForEmail()`. Esto dispara un flujo seguro de generación de token que es enviado por correo electrónico al usuario solicitante.
* **URL de Redirección (`redirectTo`):** Dentro del proceso de recuperación, el método se configura pasando un parámetro `redirectTo` que apunta a una ruta específica y segura dentro del ERP (por ejemplo, `https://erp.ambarcouture.com/reset-password`). Una vez que el usuario hace clic en el enlace del correo, es dirigido nuevamente a la aplicación Next.js, donde la sesión temporal le permite modificar la contraseña por una nueva y recuperar el acceso total al dashboard.

---

## 4. MANUAL DE OPERACIÓN Y DESPLIEGUE (DEVOPS)

El flujo de trabajo y entrega del sistema (CI/CD) se sustenta en repositorios distribuidos y plataformas de despliegue en la nube, operando bajo convenciones estrictas de control de versiones.

### Control de Versiones (Git)
Para el empaquetamiento seguro del código fuente y registro histórico de los avances, el equipo de desarrollo debe ejecutar el ciclo estándar de transacciones Git por cada nuevo feature o fix:
1. **`git add .`**: Agrega de forma recursiva los archivos modificados al área de preparación (*staging*).
2. **`git commit -m "Descripción clara del cambio"`**: Empaqueta y sella los cambios localmente en el repositorio, adjuntando una nota descriptiva de la alteración arquitectónica o visual.
3. **`git push`**: Sincroniza y transfiere de manera segura la confirmación local hacia el repositorio remoto alojado en GitHub, integrando los cambios de forma centralizada.

### Despliegue Continuo (CI/CD)
El proyecto cuenta con integración nativa entre el repositorio de **GitHub** y la plataforma serverless de **Vercel**:
* **Actualizaciones Transparentes:** Cada vez que se detecta un `git push` a la rama principal de producción (generalmente `main` o `master`), Vercel intercepta el webhook de GitHub e inicia un nuevo proceso de construcción (`npm run build`).
* **Despliegue Cero-Interrupciones:** Durante el tiempo de construcción, el sistema actual sigue en línea. Vercel valida el build, pre-renderiza las rutas de Next.js y, si el empaquetado es exitoso, reemplaza en tiempo real los activos sin afectar a los usuarios activos del ERP. De esta manera, cada funcionalidad nueva está en producción de forma automática, ágil y escalable.
