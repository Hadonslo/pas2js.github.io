program projSQLite;

{$mode objfpc}

uses
  JS, Classes, SysUtils, Web, uMain;

var
  Application: TApplication;

begin
  try
    Application := TApplication.Create;
    Application.RunApp;
  except
    on e: Exception do
      console.log(e.Message);
  end;
end.

