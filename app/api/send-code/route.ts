import { NextResponse } from 'next/server';
import { Resend } from 'resend';

// Inicializar el cliente de Resend con la variable de entorno
const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
  try {
    const { correo, nombre_quinceanera, codigo_seguridad } = await request.json();

    if (!correo || !nombre_quinceanera || !codigo_seguridad) {
      return NextResponse.json(
        { error: 'Faltan parámetros obligatorios (correo, nombre, o código)' },
        { status: 400 }
      );
    }

    const { data, error } = await resend.emails.send({
      from: "'Ámbar Couture VIP' <vip@ambarcouture.com>",
      to: correo,
      subject: '✨ Tu Pase VIP Exclusivo - Ámbar Couture',
      html: `
        <!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;1,400&family=Inter:wght@300;400;500&display=swap');
          </style>
        </head>
        <body style="margin: 0; padding: 0; background-color: #FDFBF7; font-family: 'Inter', sans-serif; -webkit-font-smoothing: antialiased;">
          <table width="100%" border="0" cellspacing="0" cellpadding="0" bgcolor="#FDFBF7" style="padding: 40px 20px;">
            <tr>
              <td align="center">
                
                <!-- Contenedor Principal -->
                <table width="100%" max-width="600" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #FFFFFF; border: 1px solid #F0EBE1; border-radius: 8px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.02);">
                  
                  <!-- Cabecera -->
                  <tr>
                    <td align="center" style="padding: 40px 40px 20px 40px;">
                      <h1 style="margin: 0; font-family: 'Playfair Display', serif; font-size: 28px; color: #1C1917; font-weight: 600; letter-spacing: -0.5px;">
                        Ámbar Couture
                      </h1>
                      <p style="margin: 8px 0 0 0; font-size: 11px; text-transform: uppercase; letter-spacing: 3px; color: #A8A29E; font-weight: 500;">
                        Experiencia Exclusiva
                      </p>
                    </td>
                  </tr>

                  <!-- Contenido -->
                  <tr>
                    <td style="padding: 20px 40px 40px 40px; text-align: center;">
                      
                      <p style="margin: 0 0 20px 0; font-size: 16px; color: #44403C; font-weight: 300; line-height: 1.6;">
                        Querida <strong style="color: #1C1917; font-weight: 500;">${nombre_quinceanera}</strong>,
                      </p>

                      <p style="margin: 0 0 35px 0; font-size: 15px; color: #57534E; font-weight: 300; line-height: 1.7;">
                        Nos complace felicitarte por el inicio de este hermoso sueño. Has sido elegida para vivir la experiencia Ámbar Couture en su máxima expresión. A continuación, te presentamos tu código de seguridad único, el cual garantiza tus beneficios exclusivos al agendar tu cita.
                      </p>

                      <!-- Recuadro del Código -->
                      <table width="100%" border="0" cellspacing="0" cellpadding="0">
                        <tr>
                          <td align="center">
                            <div style="background-color: #111827; border: 1px solid #374151; padding: 25px 40px; border-radius: 6px; display: inline-block;">
                              <p style="margin: 0 0 10px 0; color: #9CA3AF; font-size: 10px; text-transform: uppercase; letter-spacing: 2px;">
                                Tu Código Personal
                              </p>
                              <div style="margin: 0; font-family: monospace; font-size: 26px; color: #F9FAFB; font-weight: 600; letter-spacing: 4px;">
                                ${codigo_seguridad}
                              </div>
                            </div>
                          </td>
                        </tr>
                      </table>

                      <p style="margin: 35px 0 0 0; font-size: 13px; color: #78716C; font-style: italic; font-family: 'Playfair Display', serif;">
                        Guarda este código celosamente. Será tu llave dorada en tu primera visita a nuestra boutique.
                      </p>

                    </td>
                  </tr>

                  <!-- Footer -->
                  <tr>
                    <td align="center" style="padding: 25px 40px; background-color: #FAFAF9; border-top: 1px solid #F0EBE1;">
                      <p style="margin: 0; font-size: 11px; color: #A8A29E; line-height: 1.5;">
                        © ${new Date().getFullYear()} Ámbar Couture.<br>
                        Diseñando sueños, hilando momentos inolvidables.
                      </p>
                    </td>
                  </tr>

                </table>

              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
    });

    if (error) {
      console.error('--- ERROR EN RESEND ---', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data }, { status: 200 });

  } catch (error) {
    console.error('--- ERROR INESPERADO EN API/SEND-CODE ---', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
