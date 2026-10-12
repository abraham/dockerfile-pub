# escape=`
FROM mcr.microsoft.com/windows/servercore:ltsc2022
SHELL ["powershell", "-Command", "$ErrorActionPreference = 'Stop';"]
RUN dir c:\ `
    && echo done
COPY app\ C:\app\
WORKDIR C:\app
ENTRYPOINT ["C:\\app\\server.exe"]
