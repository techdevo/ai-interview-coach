import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main(){
 const candidate = await prisma.candidate.upsert({where:{email:'demo@example.com'},update:{},create:{name:'Demo Candidate',email:'demo@example.com',experienceYears:6,targetRole:'Senior Node.js Engineer'}});
 for(const s of [{name:'Node.js',score:86},{name:'AWS',score:72},{name:'PostgreSQL',score:84},{name:'System Design',score:54},{name:'Distributed Systems',score:48}]) await prisma.candidateSkill.upsert({where:{candidateId_name:{candidateId:candidate.id,name:s.name}},update:{score:s.score},create:{candidateId:candidate.id,...s}});
 console.log(candidate.id);
}
main().finally(()=>prisma.$disconnect());
