import mongoose from 'mongoose';
const schema=new mongoose.Schema({actor:String,actorRole:String,action:String,entityType:String,entityId:String,previousValue:Object,newValue:Object,reason:String,timestamp:{type:Date,default:Date.now}});export default mongoose.model('AuditLog',schema);
