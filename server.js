/**
 * SPIKE! Volleyball static server
 * npm start
 */
const http=require('http');
const fs=require('fs');
const path=require('path');

const PORT=3000;
const INDEX_PATH=path.join(__dirname,'index.html');

const httpServer=http.createServer((req,res)=>{
  fs.readFile(INDEX_PATH,(err,data)=>{
    if(err){
      res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});
      res.end('Not found');
      return;
    }
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
    res.end(data);
  });
});

httpServer.listen(PORT,()=>{
  console.log(`SPIKE! server running at http://localhost:${PORT}`);
});
