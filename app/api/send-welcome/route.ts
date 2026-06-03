import { NextResponse } from 'next/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
  try {
    const { correo, contacto, link } = await request.json();

    if (!correo || !contacto || !link) {
      return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 });
    }

    const htmlContent = `
      <div style="background-color: #faf8f5; padding: 40px 20px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #18181b;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px; border-radius: 24px; border: 1px solid #fce7f3; box-shadow: 0 10px 40px rgba(0,0,0,0.03);">
          
          <div style="text-align: center; margin-bottom: 30px;">
            <p style="color: #d97706; font-size: 11px; font-weight: bold; letter-spacing: 0.2em; text-transform: uppercase; margin-bottom: 10px;">💎 Red de Aliados VIP</p>
            <h1 style="font-size: 24px; font-weight: normal; margin: 0; color: #18181b; font-family: Georgia, serif;">¡Bienvenido, ${contacto}!</h1>
          </div>

          <p style="font-size: 15px; line-height: 1.6; color: #52525b; text-align: center; margin-bottom: 30px;">
            Estimado ${contacto}, es un honor darte la bienvenida a nuestra exclusiva red de socios comerciales de <strong>Ámbar Couture</strong>. A partir de este momento, tu cuenta se encuentra activa en nuestro ERP Central.
          </p>

          <p style="font-size: 15px; line-height: 1.6; color: #52525b; text-align: center; margin-bottom: 30px;">
            Tu enlace exclusivo de recomendación para registrar quinceañeras y acumular comisiones es:
          </p>

          <div style="background: linear-gradient(135deg, #18181b 0%, #27272a 100%); padding: 30px; border-radius: 16px; text-align: center; margin-bottom: 35px; border: 1px solid #3f3f46; box-shadow: 0 10px 25px rgba(24, 24, 27, 0.2);">
            <p style="color: #fef3c7; font-size: 16px; font-weight: 500; letter-spacing: 0.05em; margin: 0; word-break: break-all;">
              <a href="${link}" style="color: #fef3c7; text-decoration: none;">${link}</a>
            </p>
          </div>

          <p style="font-size: 12px; color: #a1a1aa; text-align: center; margin-top: 40px; line-height: 1.5;">
            Este correo fue generado automáticamente por Ámbar Couture ERP.
          </p>
        </div>
      </div>
    `;

    const { data, error } = await resend.emails.send({
      from: 'Ámbar Couture <vip@ambarcouture.com>',
      to: correo,
      subject: '¡Bienvenido a la Red VIP de Aliados de Ámbar Couture! 👗✨',
      html: htmlContent,
    });

    if (error) {
      console.error('Error de Resend en bienvenida:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('Error inesperado en send-welcome:', error);
    return NextResponse.json({ error: error?.message || 'Error interno' }, { status: 500 });
  }
}
