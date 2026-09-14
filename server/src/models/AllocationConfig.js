import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  department: {type:String, unique:true},
  weights: {
    expertise: {type:Number, default:35},
    publication: {type:Number, default:15},
    qualification: {type:Number, default:20},
    preference: {type:Number, default:15},
    continuity: {type:Number, default:10},
    feedback: {type:Number, default:5}
  },
  maxWorkload: {type:Number, default:18},
  updatedBy: String
}, {timestamps:true});

export default mongoose.model('AllocationConfig', schema);
