export type AccessData = { role:"admin"|"operator"; is_active:boolean; permissions:{screens:Record<string,boolean>;actions:Record<string,boolean>} };
export const defaultAccess:AccessData={role:"operator",is_active:false,permissions:{screens:{},actions:{}}};
export function canScreen(access:AccessData,key:string){return access.role==="admin"||access.permissions.screens[key]===true;}
export function canAction(access:AccessData,key:string){return access.role==="admin"||access.permissions.actions[key]===true;}
