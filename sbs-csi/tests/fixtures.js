export function exampleRows(){return {
  Scenes:[{scene_id:'csi-demo-map',name:'CSI Survey Office',type:'battle',image:'survey-office.webp',folder:'SBS CSI/Examples',grid_columns:12,distance:5,units:'ft',show_grid:false,padding:0.25,darkness:0.75,global_light:false,token_vision:true,fog:true,background_color:'#17251b'},
    {scene_id:'csi-demo-scenic',name:'Meet the Surveyor',type:'scenic',image:'slug-surveyor.png',folder:'SBS CSI/Examples'}],
  Walls:[
    ['north-west','wall',100,100,450,100],['north-window','window',450,100,650,100],['north-east','wall',650,100,1100,100],
    ['east','wall',1100,100,1100,800],['south-east','wall',1100,800,650,800],['entry','door',650,800,550,800,'locked'],
    ['south-west','wall',550,800,100,800],['west','wall',100,800,100,100],
    ['office-top','wall',800,100,800,350],['office-door','secret',800,350,800,450,'closed'],['office-bottom','wall',800,450,800,800]
  ].map(([wall_id,kind,x1,y1,x2,y2,state='closed'])=>({scene_id:'csi-demo-map',wall_id,kind,x1,y1,x2,y2,state,pick_dc:15,break_dc:20})),
  Lights:[{scene_id:'csi-demo-map',light_id:'desk-lamp',x:450,y:400,bright:10,dim:20,color:'#ffcc77',alpha:0.5,animation:'torch',speed:3,intensity:3},
    {scene_id:'csi-demo-map',light_id:'office-lamp',x:950,y:450,bright:5,dim:10,color:'#b4efaa',alpha:0.5}],
  Keys:[{scene_id:'csi-demo-map',key_id:'brass',name:"Surveyor's Brass Key",description:'A brass key with a tiny slug engraved into its bow.',doors:'entry;office-door',consume:false}]
};}
