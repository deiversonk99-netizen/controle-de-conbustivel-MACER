// Dados sintéticos locais. Endereços fixos impedem execução contra produção.
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
const response=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key',{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@example.test',password:'MacerDemo123!',returnSecureToken:true}),
});
const result=await response.json();
if(!response.ok)throw new Error(`Não foi possível criar usuário local: ${result.error?.message}`);
const env=await initializeTestEnvironment({projectId:'demo-macer',firestore:{host:'127.0.0.1',port:8080}});
try {
  await env.withSecurityRulesDisabled(async context=> {
    const db=context.firestore();
    await setDoc(doc(db,'users',result.localId),{name:'Administrador de demonstração',active:true,role:'admin',siteIds:['base-demo']});
    await setDoc(doc(db,'sites','base-demo','tanks','T1'),{name:'Tanque de demonstração',product:'diesel-s10',capacityMl:5000000,balanceMl:1000000,active:true,version:0,lastOperationId:'',createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
    await setDoc(doc(db,'sites','base-demo','assets','MAQ-01'),{code:'MAQ-01',name:'Máquina de demonstração',plate:'',product:'diesel-s10',capacityMl:200000,meter:'hours',readingMilli:100000,active:true,version:0,lastOperationId:'',createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
  });
  console.log('Emulador preparado. Conta local: admin@example.test / MacerDemo123!');
}finally{await env.cleanup();}
