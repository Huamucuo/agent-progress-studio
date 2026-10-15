/** Authority liveness never refreshes the age of observed Agent activity. */
export function currentPetActivity(value={},now=Date.now(),authorityFresh=false){
 if(!authorityFresh)return {...value,animation:'idle',factStatus:'source_unavailable',fresh:false};
 if(value.demo===true)return value;
 if(!['working','waiting','failed'].includes(value.animation))return value;
 const age=now-Date.parse(value.at);
 if(value.fresh!==true||!Number.isFinite(age)||age<0||age>30000)return {...value,animation:'idle',factStatus:'no_recent_evidence',fresh:false};
 return value;
}
