import {ImageResponse} from 'next/og';

const LOGO='https://ambarcouture.com/wp-content/uploads/2026/06/logo-ambar-transparente.png';
const SIZES=new Set([180,192,512]);

/** App icon of the installable ERP (home screen): Ámbar's logo centered on the brand's ivory background.
 *  Sizes 180 (iPhone), 192 and 512 (Android). The logo is kept inside the safe zone so Android can round or mask it. */
export async function GET(_request:Request,{params}:{params:Promise<{size:string}>}){
 const {size}=await params,n=Number(size);
 if(!SIZES.has(n))return new Response('Not found',{status:404});
 const logo=Math.round(n*0.62);
 return new ImageResponse(
  <div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',background:'#faf8f5'}}>
   {/* eslint-disable-next-line @next/next/no-img-element */}
   <img src={LOGO} width={logo} height={logo} style={{objectFit:'contain'}} alt=""/>
  </div>,
  {width:n,height:n,headers:{'Cache-Control':'public, max-age=86400, s-maxage=604800'}});
}
