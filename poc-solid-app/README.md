## Decentralized Purposeful Online Community Application Framework Source Code

## To run this project;
  * Install nodejs if you have not already. [Nodejs](https://nodejs.org/en/)
  * Add npm to path. In the Nodejs zip you will find a bin folder. Add it to environment variable PATH.
  * Run `npm i`
  * This can take long. No errors should be present after the command terminates. If you see something like *** packages added after the command ended, you are good to go.
  ![1.png](./images/1.png)
  * Run `npm run serve`
  You should see this:
  ![2.png](./images/2.png)
  then this: 
  ![3.png](./images/3.png)
  
* To deploy to another website, run `npm run build` and deploy dist folder. After the command you should see: 
  ![4.png](./images/4.png)

Move the dist folder to your web server to deploy. 

## Usage
* In the main page you see 4 categories Users, Datatypes(The data types users creates in the community), Tasks(Things can you do in the community) and Content(The data that are created). In the main page you will see all users' information collected together.
  ![11.png](./images/11.png)
* In your profile page you can see the content that is related to you. You see your tasks, contribution(overall look to your data) and content(individual detailed look to your data)
  ![8.png](./images/8.png)
  You see the profile button above. You see profile page below.
  ![10.png](./images/10.png)

* Click on cards to expand them for example if I click on users in the main page I see users 
  ![9.png](./images/9.png)
* To start a task, go to main page and click tasks. Then click start under the tasks you want to start. Then you can see the notifications that appear in top right region.
  ![7.png](./images/7.png)
  After pressing start button: 
  ![12.png](./images/12.png)
  After creating a task, if you need to enter some input it is said in the notifications. Go to your profile page. The tasks that are green are the ones that you need to enter your input.
  ![13.png](./images/13.png)
  Press enter input to enter input. You will see a pop up that asks the input. 
  ![14.png](./images/14.png)
  After adding your input press submit. If you entered everything correct, you will see steps being completed as notifications. 
  ![15.png](./images/15.png)
  If you need to input again the task will ask from you again. If not, the task will be complete and do the job it supposed to do. In this case we created a new story. And it is added under "Your contribution"  and "Your content" sections. 
  ![16.png](./images/16.png)
  You see above my stories as a list. There is the newly added one there too.  If you click on one of them, you go to the location of it in the Solid pod of the user who created it.


## Troubleshooting
* If you get an error regarding the application cannot fetch something you can try
  * Emptying your browser cache, sometimes redirecting to solid.community for login takes long due to it being cached. For Chrome clearing your cache: 
  ![6.png](./images/6.png)
  * Sometimes logging in again solves problems, the login info is cached but it may not be valid anymore. Click logout in the title menu and then click login again.
  ![5.png](./images/5.png)