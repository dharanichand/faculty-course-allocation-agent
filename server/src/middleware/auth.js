import jwt from 'jsonwebtoken';
import {getJwtSecret} from '../config/secrets.js';
export function auth(req,res,next){const token=req.headers.authorization?.replace('Bearer ','');if(!token)return res.status(401).json({message:'Authentication required'});try{req.user=jwt.verify(token,getJwtSecret());next()}catch{res.status(401).json({message:'Invalid token'})}}
export const role=(...roles)=>(req,res,next)=>roles.includes(req.user?.role)?next():res.status(403).json({message:'Insufficient permissions'});
