// HTTP contract fixture. Real permissions/transactions are checked in PostgreSQL tests.
import { createServer } from 'node:http';
export async function createPlannerBackend() {
  const user='aaaaaaaa-1111-4111-8111-111111111111';
  const state={polls:new Map(),receipts:new Map(),requests:[],votes:[],holdKind:null,releases:[],loseOnce:null,roles:new Map(),credentials:new Map()};
  const server=createServer(async(req,res)=>{
    res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','*');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');res.setHeader('Content-Type','application/json');
    if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
    const path=new URL(req.url,'http://localhost').pathname;
    const send=value=>res.end(JSON.stringify(value));
    const fail=(message,http=400)=>{res.writeHead(http);send({code:http===400?'P0001':'NETWORK',message});};
    if(path==='/auth/v1/signup'){
      const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');const exp=Math.floor(Date.now()/1000)+3600;
      send({access_token:encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:user,exp,role:'authenticated'})+'.fixture',refresh_token:'fixture',token_type:'bearer',expires_in:3600,expires_at:exp,user:{id:user,aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}});return;
    }
    let raw='';for await(const chunk of req)raw+=chunk;const input=raw?JSON.parse(raw):{};
    const {p,operation,kind,body={}}=input;
    const snapshot=()=>{const poll=state.polls.get(p);return poll?{...structuredClone(poll),organizer:state.roles.get(p)||false}:null;};
    if(path.endsWith('/amigo_read')){send(snapshot());return;}
    if(path.endsWith('/amigo_lock_organizer')){state.roles.set(p,false);send(null);return;}
    if(path.endsWith('/amigo_action_status')){
      const receipt=state.receipts.get(p+operation);send(receipt?{accepted:true,poll:snapshot(),session:receipt.session}: {accepted:false});return;
    }
    if(path.endsWith('/amigo_action')){
      const receipt=state.receipts.get(p+operation);
      if(receipt){send({accepted:true,poll:snapshot(),session:receipt.session});return;}
      state.requests.push(input);
      if(state.holdKind===kind)await new Promise(resolve=>state.releases.push(resolve));
      let identity=null;
      const poll=state.polls.get(p);
      if(kind==='createPoll'){
        const votes={};if(body.voter)votes[body.voter]={name:body.organizerName,votesJson:'{}'};
        state.polls.set(p,{title:body.title,description:body.description,status:'open',finalDateId:null,organizerVoter:body.voter||null,votes,
          timesEnabled:body.timesEnabled,defaultTime:body.defaultTime||'',dates:structuredClone(body.dates)});
        state.credentials.set(p,{organizer:body.organizerName,proof:body.proof,voters:{...(body.voter&&{[body.voter]:body.voterProof})}});state.roles.set(p,true);
        identity={name:body.organizerName,organizer:true,voter:body.voter||null,...(body.voter&&{proof:body.voterProof})};
      }else if(!poll){fail('Prikker niet gevonden.');return;
      }else if(kind==='signIn'){
        const credentials=state.credentials.get(p);
        if(body.name.toLowerCase()===credentials.organizer.toLowerCase()){
          if(body.organizerProof!==credentials.proof){fail('Wachtwoord klopt niet.');return;}
          identity={name:credentials.organizer,organizer:true,voter:poll.organizerVoter,...(poll.organizerVoter&&{proof:credentials.voters[poll.organizerVoter]})};
          state.roles.set(p,true);
        }else{
          const existing=Object.entries(poll.votes).find(([,voter])=>voter.name.toLowerCase()===body.name.toLowerCase());
          if(existing && credentials.voters[existing[0]]!==body.proof){fail('Wachtwoord klopt niet.');return;}
          if(!existing){poll.votes[body.voter]={name:body.name,votesJson:'{}'};credentials.voters[body.voter]=body.proof;}
          identity={name:body.name,organizer:false,voter:existing?.[0]||body.voter,proof:body.proof};state.roles.set(p,false);
        }
      }else if(!state.roles.get(p)){fail('Ontgrendel eerst de bewerkmodus.');return;
      }else if(kind==='edit'){
        if(body.title!==undefined)poll.title=body.title;if(body.description!==undefined)poll.description=body.description;
        const wipe=day=>{for(const person of Object.values(poll.votes)){const answers=JSON.parse(person.votesJson);delete answers[day];person.votesJson=JSON.stringify(answers);}};
        for(const day of body.removed||[]){delete poll.dates[day];wipe(day);}
        for(const day of body.added||[])poll.dates[day]={date:day,time:''};
        if('timesEnabled'in body)poll.timesEnabled=body.timesEnabled;
        if('defaultTime'in body)poll.defaultTime=body.defaultTime;
        for(const [day,info]of Object.entries(poll.dates)){
          const time=poll.timesEnabled?(body.times?.[day]??info.time):'';
          if(time!==info.time)wipe(day);info.time=time;
        }
        if(body.organizerParticipation){const own=body.organizerParticipation;
          if(!own.enabled){delete poll.votes[poll.organizerVoter];poll.organizerVoter=null;}
          else if(!poll.organizerVoter){poll.organizerVoter=own.voter;poll.votes[own.voter]={name:state.credentials.get(p).organizer,votesJson:'{}'};state.credentials.get(p).voters[own.voter]=own.proof;}
        }
      }else if(kind==='close'){poll.status='closed';poll.finalDateId=body.day;
      }else if(kind==='reopen'){poll.status='open';poll.finalDateId=null;
      }else if(kind==='removeVoter'){delete poll.votes[body.voter];}
      state.receipts.set(p+operation,{session:identity});
      if(state.loseOnce===kind){state.loseOnce=null;fail('Accepted but response lost',503);return;}
      send({accepted:true,poll:snapshot(),session:identity});return;
    }
    if(path.endsWith('/amigo_submit_ballot')){
      const poll=state.polls.get(p);
      if(!poll||poll.status!=='open'){fail('De prikker is gesloten of verwijderd.');return;}
      state.votes.push(input);const person=poll.votes[body.voter];
      if(!person){fail('Deze deelnemer is verwijderd.');return;}
      const answers=JSON.parse(person.votesJson);
      for(const [day,value]of Object.entries(body.changes)){
        if(body.expectedTimes?.[day]!==poll.dates[day].time){fail('Het tijdstip is gewijzigd. Controleer de datum opnieuw.');return;}
        if(value==='none')delete answers[day];else answers[day]=value;
      }
      person.votesJson=JSON.stringify(answers);send(null);return;
    }
    fail('Unknown fixture endpoint',404);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return {state,url:'http://127.0.0.1:'+server.address().port,release(){state.holdKind=null;state.releases.splice(0).forEach(resolve=>resolve());},
    async close(){state.releases.splice(0).forEach(resolve=>resolve());server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}
