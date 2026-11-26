import { createServer } from 'node:http';

export async function createVotingBackend() {
  const id='cccccccc-1111-4111-8111-111111111111';
  const voter='dddddddd-1111-4111-8111-111111111111';
  const user='aaaaaaaa-1111-4111-8111-111111111111';
  const state={reads:0,writes:[],otherWrites:0,failReads:false,loseWriteResponse:false,holdReads:false,releases:[],
    poll:{title:'Online voting',description:'',status:'open',finalDateId:null,organizer:false,organizerVoter:null,
      dates:{'2026-12-04':{date:'2026-12-04',time:''}},votes:{[voter]:{name:'Participant',votesJson:'{"2026-12-04":"no"}'}}}};
  const server=createServer(async (req,res)=>{
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Access-Control-Allow-Headers','*');
    res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
    res.setHeader('Content-Type','application/json');
    if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
    const path=new URL(req.url,'http://localhost').pathname;
    if(path==='/auth/v1/signup'){
      const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
      const exp=Math.floor(Date.now()/1000)+3600;
      res.end(JSON.stringify({access_token:encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:user,exp,role:'authenticated'})+'.fixture',
        refresh_token:'fixture-refresh',token_type:'bearer',expires_in:3600,expires_at:exp,
        user:{id:user,aud:'authenticated',role:'authenticated',email:'',app_metadata:{},user_metadata:{},created_at:new Date().toISOString()}}));return;
    }
    const fail=(code,message,http=400)=>{res.writeHead(http);res.end(JSON.stringify({code,message,details:null,hint:null}));};
    if(path==='/rest/v1/rpc/amigo_read'){
      state.reads++;
      if(state.holdReads)await new Promise(resolve=>state.releases.push(resolve));
      if(state.failReads){fail('NETWORK','Test server unreachable',503);return;}
      res.end(JSON.stringify(state.poll));return;
    }
    if(path==='/rest/v1/rpc/amigo_submit_ballot'){
      let raw='';for await(const chunk of req)raw+=chunk;
      const request=JSON.parse(raw);
      if(request.body.submissionMode!=='online'){fail('P0001','Vernieuw de pagina om online te stemmen.');return;}
      state.writes.push(request);
      const votes=JSON.parse(state.poll.votes[voter].votesJson);
      for(const [day,value]of Object.entries(request.body.changes)){
        if(value==='none')delete votes[day];else votes[day]=value;
      }
      state.poll.votes[voter].votesJson=JSON.stringify(votes);
      if(state.loseWriteResponse){fail('NETWORK','Vote accepted but response lost',503);return;}
      res.end('null');return;
    }
    if(path==='/rest/v1/rpc/amigo_lock_organizer'){state.otherWrites++;res.end('null');return;}
    if(path==='/auth/v1/user'){res.end(JSON.stringify({id:user,aud:'authenticated',role:'authenticated'}));return;}
    fail('NOT_FOUND','Unknown fixture endpoint '+path,404);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return {id,voter,state,url:'http://127.0.0.1:'+server.address().port,
    release(){state.holdReads=false;state.releases.splice(0).forEach(resolve=>resolve());},
    async close(){state.releases.splice(0).forEach(resolve=>resolve());server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}
