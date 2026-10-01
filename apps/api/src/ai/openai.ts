import OpenAI from 'openai';
import { z } from 'zod';
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
export const model = process.env.OPENAI_MODEL || 'gpt-5.6-luna';
export async function jsonCompletion<T extends z.ZodType>(instructions:string,input:string,schema:T):Promise<z.infer<T>>{
  if(!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured');
  const response = await client.responses.create({model,instructions,input,text:{format:{type:'json_schema',name:'result',strict:true,schema:z.toJSONSchema(schema)}}});
  const parsed = JSON.parse(response.output_text);
  return schema.parse(parsed) as z.infer<T>;
}
