import * as THREE from "three";
import { OrbitControls } from 'three/addons/controls/OrbitControls';

export class MyScene {
  constructor() {
    this.avatars = {};

    // create a scene in which all other objects will exist
    this.scene = new THREE.Scene();

    // 将透视相机改为正交相机
    let aspect = window.innerWidth / window.innerHeight;
    let frustumSize = 10;
    this.camera = new THREE.OrthographicCamera(
      frustumSize * aspect / -2,
      frustumSize * aspect / 2,
      frustumSize / 2,
      frustumSize / -2,
      0.1,
      1000
    );
    this.camera.position.set(0, 5, 0); //调整相机位置
    this.camera.lookAt(0, 0, 0);

    // the renderer will actually show the camera view within our <canvas>
    this.renderer = new THREE.WebGLRenderer();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(this.renderer.domElement);

    // add shadows
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // default THREE.PCFShadowMap

    this.setupEnvironment();
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.raycaster = new THREE.Raycaster();
    // 创建玩家对象
    this.player = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0xff0000 })
    );
    this.scene.add(this.player);

    // 监听键盘事件
    document.addEventListener("keydown", this.handleKeyDown.bind(this));
    document.addEventListener("keyup", this.handleKeyUp.bind(this));
    this.keysPressed = {};

    this.frameCount = 0;
    // 创建NPC
    this.npcs = [];
    this.npcPositions = [
      { x: -5, y: 0.5, z: 0 },
      { x: 5, y: 0.5, z: 0 },
      { x: 0, y: 0.5, z: -5 },
      { x: 0, y: 0.5, z: 5 },
      { x: -5, y: 0.5, z: -5 },
      { x: 2, y: 0.5, z: 5 },
      { x: 0, y: 0.5, z: 0 },
    ];


    for (let i = 0; i < this.npcPositions.length; i++) {
      const npc = new THREE.Mesh(
        new THREE.TorusGeometry(0.5, 0.2, 16, 100),
        new THREE.MeshBasicMaterial({ color: 0x00ff00 })
      );
      npc.position.set(this.npcPositions[i].x, this.npcPositions[i].y, this.npcPositions[i].z);
      this.scene.add(npc);

      const labelDiv = document.createElement('div');
      labelDiv.className = 'npc-label';
      labelDiv.textContent = `NPC${i + 1}`;
      document.getElementById('user-label-container').appendChild(labelDiv);

      this.npcs.push({ mesh: npc, labelDiv: labelDiv });
      // 创建对话标签
      const dialogueDiv = document.createElement('div');
      dialogueDiv.className = 'npc-dialogue';
      dialogueDiv.textContent = '';
      dialogueDiv.style.position = 'absolute';
      dialogueDiv.style.display = 'none'; // 默认不显示
      document.body.appendChild(dialogueDiv); // 添加到页面中

      // 存储对话标签引用
      this.npcs[i].dialogueDiv = dialogueDiv;
    }
    // 设置拖动控制
    this.dragControls = new DragControls(this.npcs.map(npc => npc.mesh), this.camera, this.renderer.domElement);
    this.dragControls.addEventListener('dragstart', (event) => {
      this.controls.enabled = false; // 当拖动开始时，禁用OrbitControls来避免冲突
      this.selectedNPC = event.object; // 记录当前被拖动的NPC
    });

    this.dragControls.addEventListener('drag', (event) => {
      const pos = event.object.position.clone();
      pos.y = 0.5; // 保持NPC在地面之上固定高度
      event.object.position.copy(pos); // 更新被拖动的NPC位置
      // 为调试目的打印当前拖动的NPC的索引和位置
      console.log(`拖动NPC索引: ${this.npcs.findIndex(npc => npc.mesh === event.object)} 到位置:`, pos);
    });

    this.dragControls.addEventListener('dragend', (event) => {
      // 重新启用 OrbitControls
      this.controls.enabled = true;

      // 找到拖动的NPC在数组中的索引
      const index = this.npcs.findIndex(npc => npc.mesh === event.object);

      // 确保我们找到了NPC，且它在场景中
      if (index !== -1 && this.scene.children.includes(event.object)) {
        // 使用新的位置更新NPC的位置
        this.npcPositions[index] = event.object.position.clone();

        // 打印出更新后的位置，用于调试
        console.log(`NPC索引: ${index} 移动到位置:`, this.npcPositions[index]);

        // 立即重新渲染场景，确保位置更新
        this.renderer.render(this.scene, this.camera);
      } else {
        // 如果找不到NPC或NPC不在场景中，则打印错误消息
        console.error(`无法找到NPC或NPC不在场景中: ${index}`);
      }

      // 清除 selectedNPC，因为拖动已结束
      this.selectedNPC = null;
    });
    this.selectedDialogues = [];
    // 创建用于显示自己用户名的HTML元素
    this.playerLabelDiv = document.createElement('div');
    this.playerLabelDiv.className = 'user-label';
    this.playerLabelDiv.textContent = 'Me';
    document.getElementById('user-label-container').appendChild(this.playerLabelDiv);
    // 创建地面
    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 100),
      new THREE.MeshBasicMaterial({ color: 0xcccccc, transparent: true, opacity: 0.5 })
    );
    this.ground.rotation.x = -Math.PI / 2;
    this.scene.add(this.ground);
    // Load dialogues and start the scene loop after dialogues are assigned
    this.loadDialogues().then(() => {
      this.startDialogueTimer(); // 确保在开始计时器之前加载对话框
      this.loop();
    });
  }
  loadDialogues() {
    // 确保这里返回 promise
    return fetch('npc_dialogues_clean_array.json') // 调整路径以符合您的设置
      .then(response => response.json())
      .then(dialogues => {
        this.assignDialogues(dialogues);
      });
  }
  assignDialogues(dialogues) {
    this.npcs.forEach((npc, index) => {
      // Assuming each NPC dialogue is at the corresponding index
      npc.dialogues = dialogues.map(dialogue => dialogue[`NPC${index + 1}`]);
      npc.currentDialogueIndex = 0;

      // 创建对话标签
      const dialogueDiv = document.createElement('div');
      dialogueDiv.className = 'npc-dialogue';
      dialogueDiv.textContent = '';
      dialogueDiv.style.position = 'absolute';
      dialogueDiv.style.display = 'none'; // 默认不显示
      dialogueDiv.addEventListener('click', () => {
        this.selectDialogue(npc.dialogueDiv.textContent);
      });
      document.body.appendChild(dialogueDiv); // 添加到页面中

      // 存储对话标签引用
      npc.dialogueDiv = dialogueDiv;
    });

    // Start the dialogue refresh timer
    this.startDialogueTimer();
  }
  //////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////
  // Lighting 💡

  setupEnvironment() {
    this.scene.background = new THREE.Color(0xffaabb);

    this.scene.add(new THREE.GridHelper(100, 100));

    //add a light
    let myColor = new THREE.Color(0xffaabb);
    let ambientLight = new THREE.AmbientLight(myColor, 0.5);
    this.scene.add(ambientLight);

    // add a directional light
    let myDirectionalLight = new THREE.DirectionalLight(myColor, 0.85);
    myDirectionalLight.position.set(-5, 3, -5);
    myDirectionalLight.lookAt(0, 0, 0);
    myDirectionalLight.castShadow = true;
    this.scene.add(myDirectionalLight);

    // add a ground
    let groundGeo = new THREE.BoxGeometry(100, 0.1, 100);
    let groundMat = new THREE.MeshPhongMaterial({ color: "blue" });
    let ground = new THREE.Mesh(groundGeo, groundMat);
    ground.receiveShadow = true;
    // this.scene.add(ground);
  }

  //////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////
  // Player 🏃‍♂️

  handleKeyDown(event) {
    this.keysPressed[event.key] = true;
  }

  handleKeyUp(event) {
    this.keysPressed[event.key] = false;
  }

  updatePlayerPosition() {
    const speed = 0.1;

    // 根据按键输入更新玩家位置
    if (this.keysPressed["w"]) this.player.position.z -= speed;
    if (this.keysPressed["s"]) this.player.position.z += speed;
    if (this.keysPressed["a"]) this.player.position.x -= speed;
    if (this.keysPressed["d"]) this.player.position.x += speed;

    // 根据移动方向调整玩家朝向
    const direction = new THREE.Vector3();
    if (this.keysPressed["w"]) direction.z -= 1;
    if (this.keysPressed["s"]) direction.z += 1;
    if (this.keysPressed["a"]) direction.x -= 1;
    if (this.keysPressed["d"]) direction.x += 1;
    if (direction.length() > 0) {
      this.player.lookAt(this.player.position.clone().add(direction));
    }
  }

  updateCameraPosition() {
    // 计算相机相对于玩家的位置
    const cameraOffset = new THREE.Vector3(10, 10, 10);
    const cameraPosition = this.player.position.clone().add(cameraOffset);

    // 更新相机位置
    this.camera.position.copy(cameraPosition);

    // 相机始终看向玩家
    this.camera.lookAt(this.player.position);
  }

  //////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////
  // Peers 👫

  addPeerAvatar(id, username) {
    console.log("Adding peer avatar to 3D scene.");
    this.avatars[id] = {};

    let videoElement = document.getElementById(id + "_video");
    let videoTexture = new THREE.VideoTexture(videoElement);

    let videoMaterial = new THREE.MeshBasicMaterial({
      map: videoTexture,
      overdraw: true,
      side: THREE.DoubleSide,
    });
    let otherMat = new THREE.MeshNormalMaterial();

    let head = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), [
      otherMat,
      otherMat,
      otherMat,
      otherMat,
      otherMat,
      videoMaterial,
    ]);

    // set position of head before adding to parent object
    head.position.set(0, 0, 0);

    // 创建用于显示用户名的HTML元素
    const labelDiv = document.createElement('div');
    labelDiv.className = 'user-label';
    labelDiv.textContent = id;
    document.getElementById('user-label-container').appendChild(labelDiv);

    // add head directly to the scene
    this.scene.add(head);

    this.avatars[id] = {
      head: head,
      labelDiv: labelDiv,
    };
  }

  removePeerAvatar(id) {
    console.log("Removing peer avatar from 3D scene.");
    this.scene.remove(this.avatars[id].head);
    document.getElementById('user-label-container').removeChild(this.avatars[id].labelDiv);
    delete this.avatars[id];
  }

  updatePeerAvatars(peerInfoFromServer) {
    for (let id in peerInfoFromServer) {
      if (this.avatars[id]) {
        let pos = peerInfoFromServer[id].position;
        let rot = peerInfoFromServer[id].rotation;

        this.avatars[id].head.position.set(pos[0], pos[1], pos[2]);
        this.avatars[id].head.quaternion.set(rot[0], rot[1], rot[2], rot[3]);
      }
    }
  }

  updateClientVolumes() {
    for (let id in this.avatars) {
      let audioEl = document.getElementById(id + "_audio");
      if (audioEl && this.avatars[id].head) {
        let distSquared = this.camera.position.distanceToSquared(
          this.avatars[id].head.position
        );

        if (distSquared > 500) {
          audioEl.volume = 0;
        } else {
          // https://discourse.threejs.org/t/positionalaudio-setmediastreamsource-with-webrtc-question-not-hearing-any-sound/14301/29
          let volume = Math.min(1, 10 / distSquared);
          audioEl.volume = volume;
        }
      }
    }
  }
  updatePeerUsername(id, username) {
    if (this.avatars[id]) {
      this.avatars[id].labelDiv.textContent = username;
    }
  }
  updatePlayerUsername(username) {
    this.playerLabelDiv.textContent = username;
  }

  updateDialogue() {
    this.npcs.forEach((npc, index) => {
      const proximityThreshold = 4;
      const distance = npc.mesh.position.distanceTo(this.player.position);
      const isCloseToPlayer = distance < proximityThreshold;
      const dialogues = npc.dialogues;
      const dialogueIndex = npc.currentDialogueIndex % dialogues.length;
  
      // Display dialogues for NPCs in proximity
      if (isCloseToPlayer) {
        // 确保有对话要显示
        if (!dialogues || dialogues.length === 0) {
          console.error(`No dialogues found for NPC${index + 1}`);
          return;
        }
        if ((index === 0 || index === 1) || // NPCs 1 and 2
          (index === 2 || index === 3) || // NPCs 3 and 4
          (index === 4 || index === 5)) { // NPCs 5 and 6
          // Find the partner NPC index
          const partnerIndex = index % 2 === 0 ? index + 1 : index - 1;
          const partnerDialogue = this.npcs[partnerIndex].dialogues[dialogueIndex];
  
          npc.dialogueDiv.textContent = dialogues[dialogueIndex] + " " + partnerDialogue;
        } else if (index === 6) { // NPC 7
          npc.dialogueDiv.textContent = dialogues[dialogueIndex];
        }
        npc.dialogueDiv.style.display = 'block';
        this.updateDialoguePosition(npc.mesh, npc.dialogueDiv); // 更新对话框位置
      } else {
        npc.dialogueDiv.style.display = 'none';
      }
    });
  }
  

  startDialogueTimer() {
    setInterval(() => {
      this.npcs.forEach(npc => {
        npc.currentDialogueIndex++;
      });
      this.updateDialogue();
    }, 5000);
  }

  updateDialoguePosition(mesh, dialogueDiv) {
    const labelPosition = new THREE.Vector3();
    labelPosition.setFromMatrixPosition(mesh.matrixWorld);
    labelPosition.y += 1; // 在Y轴方向上稍微提升标签位置
    labelPosition.project(this.camera);

    const x = (labelPosition.x * .5 + .5) * this.renderer.domElement.clientWidth;
    const y = (labelPosition.y * -.5 + .5) * this.renderer.domElement.clientHeight;

    dialogueDiv.style.left = `${x}px`;
    dialogueDiv.style.top = `${y}px`;
  }
  // 新增的帮助函数用于更新标签位置
  updateLabelPosition(object3D, labelDiv, yOffset) {
    const labelPosition = object3D.position.clone();
    labelPosition.y += yOffset; // 在Y轴方向上稍微提升标签位置
    labelPosition.project(this.camera);

    const x = (labelPosition.x * 0.5 + 0.5) * this.renderer.domElement.clientWidth;
    const y = (labelPosition.y * -0.5 + 0.5) * this.renderer.domElement.clientHeight;

    labelDiv.style.transform = `translate(-50%, -50%) translate(${x}px,${y}px)`;
    labelDiv.style.zIndex = labelPosition.z < 1 ? '25' : '-25';
  }
  selectDialogue(dialogue) {
    console.log(`Dialogue selected: ${dialogue}`);
    // 防止选中超过5条对话
    if (this.selectedDialogues.length >= 5) {
      alert('You can only select up to 5 dialogues.');
      return;
    }
  
    // 添加对话内容到数组
    this.selectedDialogues.push(dialogue);
  
    // 更新UI
    this.updateSelectedDialoguesUI();
  
    // 检查是否选中了5条对话
    if (this.selectedDialogues.length === 5) {
      const prompt = this.selectedDialogues.join(' ');
      console.log(prompt); // 这里您可以处理prompt，例如发送给服务器
    }
  }

  updateSelectedDialoguesUI() {
    console.log("Updating selected dialogues UI");
    const listElement = document.getElementById('selected-dialogues-list');
    listElement.innerHTML = ''; // 清空当前列表
    this.selectedDialogues.forEach(dialogue => {
      const listItem = document.createElement('li');
      listItem.textContent = dialogue;
      listElement.appendChild(listItem);
    });
  }
  //////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////
  // Interaction 🤾‍♀️

  getPlayerPosition() {
    return [
      [this.player.position.x, this.player.position.y, this.player.position.z],
      [
        this.player.quaternion._x,
        this.player.quaternion._y,
        this.player.quaternion._z,
        this.player.quaternion._w,
      ],
    ];
  }

  //////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////
  // Rendering 🎥
  loop() {
    this.frameCount++;

    // 更新玩家和相机位置
    this.updatePlayerPosition();
    this.updateCameraPosition();

    // 更新自己的用户名标签位置
    this.updateLabelPosition(this.player, this.playerLabelDiv, 0.2);

    // 更新其他玩家的用户名标签位置
    Object.values(this.avatars).forEach(avatar => {
      this.updateLabelPosition(avatar.head, avatar.labelDiv, 0.2);
    });

    // 更新NPC位置和标签位置
    this.npcs.forEach(npc => {
      this.updateLabelPosition(npc.mesh, npc.labelDiv, 0.7);
    });

    this.updateDialogue();



    // 只有当一个NPC被选中拖动时，才运行射线投射器的逻辑
    if (this.selectedNPC) {
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const intersects = this.raycaster.intersectObject(this.ground);
      if (intersects.length > 0) {
        const intersectPoint = intersects[0].point;
        intersectPoint.y = 0.5; // 保持NPC在地面之上固定高度
        this.selectedNPC.position.copy(intersectPoint); // 只更新被拖动的NPC位置
      }
    }

    // 定期更新客户端音量
    if (this.frameCount % 25 === 0) {
      this.updateClientVolumes();
    }

    // 渲染场景
    this.renderer.render(this.scene, this.camera);

    // 请求下一帧动画
    requestAnimationFrame(() => this.loop());
  }
}  