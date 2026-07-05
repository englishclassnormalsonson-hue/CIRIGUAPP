(function(){
    const LOGIN_PAGE = "login.html";
    const DEFAULT_PAGE = "index.html";
    const isLoginPage = /(^|\/)login\.html$/.test(window.location.pathname);

    function currentPage(){
        const page = window.location.pathname.split("/").pop() || DEFAULT_PAGE;
        return page + window.location.search + window.location.hash;
    }

    function loginUrl(){
        return LOGIN_PAGE + "?redirect=" + encodeURIComponent(currentPage());
    }

    function redirectToLogin(){
        if(!isLoginPage){
            window.location.replace(loginUrl());
        }
    }

    async function getCurrentSession(){
        if(!window.supabaseClient || !window.supabaseClient.auth){
            return null;
        }

        const { data, error } = await window.supabaseClient.auth.getSession();
        if(error){
            throw error;
        }

        return data && data.session ? data.session : null;
    }

    async function requireCiriguaSession(){
        const session = await getCurrentSession();
        if(!session){
            redirectToLogin();
            throw new Error("Sesion requerida");
        }
        return session;
    }

    function getRedirectTarget(){
        const params = new URLSearchParams(window.location.search);
        const redirect = params.get("redirect") || DEFAULT_PAGE;
        if(/^https?:\/\//i.test(redirect) || redirect.startsWith("//")){
            return DEFAULT_PAGE;
        }
        return redirect;
    }

    function renderLogout(session){
        if(isLoginPage || document.getElementById("ciriguaLogout")){
            return;
        }

        const button = document.createElement("button");
        button.id = "ciriguaLogout";
        button.className = "logout-btn";
        button.type = "button";
        button.textContent = "Cerrar sesión";
        button.title = session && session.user && session.user.email ? session.user.email : "Cerrar sesión";
        button.addEventListener("click", async function(){
            button.disabled = true;
            button.textContent = "Cerrando...";
            await window.supabaseClient.auth.signOut();
            window.location.replace(LOGIN_PAGE);
        });

        return button;
    }

    function isIndexPage(){
        const page = window.location.pathname.split("/").pop() || DEFAULT_PAGE;
        return page === DEFAULT_PAGE;
    }

    function buildHomeButton(){
        const button = document.createElement("button");
        button.type = "button";
        button.className = "inicio app-nav-btn app-home-btn";
        button.textContent = "🏠 Inicio";
        button.addEventListener("click", function(){
            window.location.href = DEFAULT_PAGE;
        });
        return button;
    }

    function normalizeHeader(session){
        if(isLoginPage){
            return;
        }

        const header = document.querySelector(".encabezado");
        const logoutButton = renderLogout(session);

        if(!header){
            if(logoutButton){
                document.body.appendChild(logoutButton);
            }
            return;
        }

        if(header.classList.contains("app-header")){
            if(logoutButton){
                const right = header.querySelector(".app-header-right");
                if(right){
                    right.appendChild(logoutButton);
                }
            }
            return;
        }

        const left = document.createElement("div");
        const center = document.createElement("div");
        const right = document.createElement("div");

        left.className = "app-header-left";
        center.className = "app-header-center";
        right.className = "app-header-right";

        const homeCandidates = Array.from(document.querySelectorAll("button")).filter(function(button){
            const onclick = button.getAttribute("onclick") || "";
            return onclick.indexOf("index.html") !== -1 &&
                !button.classList.contains("inicio-recibo") &&
                !button.closest(".menu-admin");
        });

        let homeButton = null;
        if(!isIndexPage()){
            homeButton = homeCandidates[0] || buildHomeButton();
            homeButton.classList.add("app-nav-btn", "app-home-btn");
            left.appendChild(homeButton);
        }

        Array.from(header.childNodes).forEach(function(node){
            if(node.nodeType === Node.TEXT_NODE && node.textContent.trim() === ""){
                return;
            }
            center.appendChild(node);
        });

        if(isIndexPage()){
            const refreshButton = center.querySelector("#refrescarMesas");
            if(refreshButton){
                refreshButton.classList.add("app-nav-btn");
                right.appendChild(refreshButton);
            }
        }

        if(logoutButton){
            logoutButton.classList.add("app-nav-btn");
            right.appendChild(logoutButton);
        }

        header.innerHTML = "";
        header.classList.add("app-header");
        if(isIndexPage()){
            header.classList.add("app-header-home");
        }
        header.appendChild(left);
        header.appendChild(center);
        header.appendChild(right);

        homeCandidates.slice(1).forEach(function(button){
            if(button.closest(".acciones-volver")){
                button.remove();
            }
        });

        document.querySelectorAll(".barra-superior").forEach(function(bar){
            if(bar.textContent.trim() === ""){
                bar.remove();
            }
        });
    }

    async function setupLoginPage(){
        const existingSession = await getCurrentSession();
        if(existingSession){
            window.location.replace(getRedirectTarget());
            return;
        }

        const form = document.getElementById("loginForm");
        if(!form){
            return;
        }

        const emailInput = document.getElementById("loginEmail");
        const passwordInput = document.getElementById("loginPassword");
        const submitButton = document.getElementById("loginSubmit");
        const message = document.getElementById("loginMessage");

        form.addEventListener("submit", async function(event){
            event.preventDefault();
            message.textContent = "";
            submitButton.disabled = true;
            submitButton.textContent = "Ingresando...";

            const { error } = await window.supabaseClient.auth.signInWithPassword({
                email: emailInput.value.trim(),
                password: passwordInput.value
            });

            if(error){
                message.textContent = "No se pudo iniciar sesión. Verifique el correo y la contraseña.";
                submitButton.disabled = false;
                submitButton.textContent = "Ingresar";
                return;
            }

            window.location.replace(getRedirectTarget());
        });
    }

    async function setupProtectedPage(){
        try{
            const session = await requireCiriguaSession();
            normalizeHeader(session);
            document.documentElement.classList.add("auth-ready");
        }catch(error){
            document.documentElement.classList.add("auth-blocked");
        }
    }

    window.requireCiriguaSession = requireCiriguaSession;
    window.ciriguaAuthReady = isLoginPage ? setupLoginPage() : setupProtectedPage();
})();
