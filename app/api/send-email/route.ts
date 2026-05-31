import { NextResponse } from 'next/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
  try {
    const { emailQuinceanera, nombreQuinceanera, codigoVip, nombreAliado } = await request.json();

    if (!emailQuinceanera || !nombreQuinceanera || !codigoVip || !nombreAliado) {
      return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 });
    }

    const htmlContent = `
      <div style="background-color: #faf8f5; padding: 40px 20px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #18181b;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px; border-radius: 24px; border: 1px solid #fce7f3; box-shadow: 0 10px 40px rgba(0,0,0,0.03);">
          
          <div style="text-align: center; margin-bottom: 30px;">
            <p style="color: #d97706; font-size: 11px; font-weight: bold; letter-spacing: 0.2em; text-transform: uppercase; margin-bottom: 10px;">✨ Beneficio VIP Exclusivo</p>
            <h1 style="font-size: 24px; font-weight: normal; margin: 0; color: #18181b; font-family: Georgia, serif;">¡Felicidades ${nombreQuinceanera}!</h1>
          </div>

          <p style="font-size: 15px; line-height: 1.6; color: #52525b; text-align: center; margin-bottom: 30px;">
            Has recibido un bono de regalo válido por hasta <strong style="color: #18181b;">$200.000</strong> para el alquiler de tu vestido de 15 años ideal, gracias a la alianza exclusiva con nuestro socio comercial <strong style="color: #18181b;">${nombreAliado}</strong>.
          </p>

          <div style="background: linear-gradient(135deg, #18181b 0%, #27272a 100%); padding: 30px; border-radius: 16px; text-align: center; margin-bottom: 35px; border: 1px solid #3f3f46; box-shadow: 0 10px 25px rgba(24, 24, 27, 0.2);">
            <p style="color: #a1a1aa; font-size: 10px; font-weight: bold; letter-spacing: 0.3em; text-transform: uppercase; margin: 0 0 10px 0;">Tu Código Exclusivo</p>
            <p style="color: #fef3c7; font-size: 32px; font-weight: 300; letter-spacing: 0.1em; margin: 0; font-family: 'Courier New', Courier, monospace;">${codigoVip}</p>
          </div>

          <div style="text-align: center;">
            <a href="https://wa.me/573017307411?text=Hola,%20tengo%20un%20Pase%20VIP%20Dorado%20(${codigoVip})%20gracias%20a%20${nombreAliado}.%20Quiero%20agendar%20mi%20cita!" 
               style="display: inline-block; background: linear-gradient(to right, #fbbf24, #f59e0b); color: #451a03; padding: 16px 36px; border-radius: 12px; font-weight: bold; font-size: 14px; text-decoration: none; letter-spacing: 0.05em; text-transform: uppercase; box-shadow: 0 4px 15px rgba(245, 158, 11, 0.3);">
              ✨ Agendar mi Cita VIP
            </a>
          </div>

          <p style="font-size: 12px; color: #a1a1aa; text-align: center; margin-top: 40px; line-height: 1.5;">
            Presenta este código durante tu primera visita a Ámbar Couture para hacer válido tu beneficio exclusivo.<br/>
            Este correo fue generado automáticamente.
          </p>
        </div>
      </div>
    `;

    const { data, error } = await resend.emails.send({
      from: 'Ámbar Couture VIP <vip@ambarcouture.com>',
      to: emailQuinceanera,
      subject: '✨ Tu Pase VIP Dorado de Alta Costura - Regalo de ' + nombreAliado,
      html: htmlContent,
    });

    if (error) {
      console.error('Error de Resend:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('Error inesperado en send-email:', error);
    return NextResponse.json({ error: error?.message || 'Error interno' }, { status: 500 });
  }
}
