const sharp=require('sharp'),fs=require('fs'),path=require('path');
const T=path.join(__dirname,'..','assets','tex');
const BIG=new Set(['asphalt_02','square_concrete_pavers','red_brick_03','white_plaster_02','yellow_plaster','concrete_floor_02']);
(async()=>{for(const d of fs.readdirSync(T)){for(const k of ['diff','nor','arm']){const src=path.join(T,d,k+'.jpg');if(!fs.existsSync(src))continue;
const s=BIG.has(d)?2048:1024;await sharp(src).resize(s,s).webp({quality:k==='nor'?92:86}).toFile(path.join(T,d,k+'.webp'));fs.unlinkSync(src);}}
console.log('ok')})();
